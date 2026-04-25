/**
 * Walks apps/api/src/routers + index.ts and emits apps/web/src/lib/trpc-procedure-rbac.generated.ts
 * mapping flat tRPC procedure paths → RBAC rule kind for client-side query enabled merging.
 *
 * Run: pnpm --filter @nexusops/api exec tsx ../../scripts/generate-trpc-rbac-map.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

const ROOT = path.join(__dirname, "..");
const ROUTERS_DIR = path.join(ROOT, "apps/api/src/routers");
const INDEX_FILE = path.join(ROUTERS_DIR, "index.ts");
const OUT_FILE = path.join(ROOT, "apps/web/src/lib/trpc-procedure-rbac.generated.ts");

type RuleJson =
  | { kind: "rbac"; module: string; action: string }
  | { kind: "adminRole" }
  | { kind: "protected" }
  | { kind: "public" }
  | { kind: "authMe" };

const out: Record<string, RuleJson> = {};

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "").trim();
}

function parsePermissionArgs(call: ts.CallExpression, sf: ts.SourceFile): { module: string; action: string } | null {
  const a0 = call.arguments[0];
  const a1 = call.arguments[1];
  if (!a0 || !a1) return null;
  let mod = a0.getText(sf).replace(/\s+as\s+any\s*$/i, "").trim();
  mod = stripQuotes(mod);
  const act = stripQuotes(a1.getText(sf));
  if (!mod || !act) return null;
  return { module: mod, action: act };
}

function findPermissionProcedureCall(node: ts.Node): ts.CallExpression | null {
  let found: ts.CallExpression | null = null;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "permissionProcedure") {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function procedureKind(init: ts.Expression, sf: ts.SourceFile): RuleJson | null {
  const text = init.getText(sf);
  if (text.startsWith("adminProcedure")) return { kind: "adminRole" };
  if (text.startsWith("publicProcedure")) return { kind: "public" };
  if (text.startsWith("protectedProcedure")) return { kind: "protected" };
  const perm = findPermissionProcedureCall(init);
  if (perm) {
    const p = parsePermissionArgs(perm, sf);
    if (p) return { kind: "rbac", module: p.module, action: p.action };
  }
  return null;
}

function collectRouterLiterals(sf: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const m = new Map<string, ts.ObjectLiteralExpression>();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer || !ts.isCallExpression(decl.initializer)) continue;
      const initCall = decl.initializer;
      if (!ts.isIdentifier(initCall.expression) || initCall.expression.text !== "router") continue;
      const arg0 = initCall.arguments[0];
      if (arg0 && ts.isObjectLiteralExpression(arg0)) {
        m.set(decl.name.text, arg0);
      }
    }
  }
  return m;
}

function walkObject(
  obj: ts.ObjectLiteralExpression,
  prefix: string[],
  sf: ts.SourceFile,
  routerLiterals: Map<string, ts.ObjectLiteralExpression>,
  emit: (path: string, rule: RuleJson) => void,
) {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const nameNode = prop.name;
    if (!ts.isIdentifier(nameNode) && !ts.isStringLiteral(nameNode)) continue;
    const propName = ts.isIdentifier(nameNode) ? nameNode.text : nameNode.text;
    const init = prop.initializer;
    if (!init) continue;

    if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "router") {
      const arg0 = init.arguments[0];
      if (arg0 && ts.isObjectLiteralExpression(arg0)) {
        walkObject(arg0, [...prefix, propName], sf, routerLiterals, emit);
      }
      continue;
    }

    if (ts.isIdentifier(init)) {
      const nested = routerLiterals.get(init.text);
      if (nested) {
        walkObject(nested, [...prefix, propName], sf, routerLiterals, emit);
      }
      continue;
    }

    const rule = procedureKind(init, sf);
    if (rule) {
      emit([...prefix, propName].join("."), rule);
    }
  }
}

function parseRouterFile(filePath: string, trpcTopKey: string, exportVarName: string) {
  const text = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const routerLiterals = collectRouterLiterals(sf);
  const main = routerLiterals.get(exportVarName);
  if (!main) {
    console.warn("no router literal", exportVarName, "in", path.relative(ROOT, filePath));
    return;
  }
  walkObject(main, [trpcTopKey], sf, routerLiterals, (p, rule) => {
    out[p] = rule;
  });
}

function parseIndex(): { file: string; trpcKey: string; exportVarName: string }[] {
  const text = fs.readFileSync(INDEX_FILE, "utf8");
  const sf = ts.createSourceFile(INDEX_FILE, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const importMap = new Map<string, string>(); // RouterName -> ./file
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const modPath = stmt.moduleSpecifier.text;
    if (!modPath.startsWith("./")) continue;
    for (const spec of stmt.importClause?.namedBindings && ts.isNamedImports(stmt.importClause.namedBindings)
      ? stmt.importClause.namedBindings.elements
      : []) {
      if (ts.isImportSpecifier(spec) && ts.isIdentifier(spec.name)) {
        importMap.set(spec.name.text, modPath);
      }
    }
  }

  const routerVarToTrpcKey = new Map<string, string>();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== "appRouter") continue;
      if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;
      const call = decl.initializer;
      if (!ts.isIdentifier(call.expression) || call.expression.text !== "router") continue;
      const arg0 = call.arguments[0];
      if (!arg0 || !ts.isObjectLiteralExpression(arg0)) continue;
      for (const p of arg0.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const kn = p.name;
        const trpcKey = ts.isIdentifier(kn) ? kn.text : ts.isStringLiteral(kn) ? kn.text : null;
        const init = p.initializer;
        if (!trpcKey || !init || !ts.isIdentifier(init)) continue;
        routerVarToTrpcKey.set(init.text, trpcKey);
      }
    }
  }

  const res: { file: string; trpcKey: string; exportVarName: string }[] = [];
  for (const [varName, trpcKey] of routerVarToTrpcKey) {
    const imp = importMap.get(varName);
    if (!imp) continue;
    const file = path.join(ROUTERS_DIR, imp.replace(/^\.\//, ""));
    const resolved = file.endsWith(".ts") ? file : `${file}.ts`;
    res.push({ file: resolved, trpcKey, exportVarName: varName });
  }
  return res;
}

function main() {
  const routers = parseIndex();
  for (const { file, trpcKey, exportVarName } of routers) {
    if (!fs.existsSync(file)) {
      console.warn("missing router file", file);
      continue;
    }
    parseRouterFile(file, trpcKey, exportVarName);
  }

  out["auth.me"] = { kind: "authMe" };

  const keys = Object.keys(out).sort();
  const lines: string[] = [
    "/**",
    " * AUTO-GENERATED by scripts/generate-trpc-rbac-map.ts — do not edit by hand.",
    " * Maps tRPC procedure path (e.g. tickets.list) → RBAC rule for client query gating.",
    " */",
    'import type { Module, RbacAction } from "@nexusops/types";',
    "",
    "export type TrpcProcedureRbacRule =",
    '  | { kind: "rbac"; module: Module; action: RbacAction }',
    '  | { kind: "adminRole" }',
    '  | { kind: "protected" }',
    '  | { kind: "public" }',
    '  | { kind: "authMe" };',
    "",
    "export const TRPC_PROCEDURE_RBAC: Record<string, TrpcProcedureRbacRule> = {",
  ];
  for (const k of keys) {
    const v = out[k]!;
    const json =
      v.kind === "rbac"
        ? `{ kind: "rbac", module: ${JSON.stringify(v.module)} as Module, action: ${JSON.stringify(v.action)} as RbacAction }`
        : `{ kind: ${JSON.stringify(v.kind)} }`;
    lines.push(`  ${JSON.stringify(k)}: ${json},`);
  }
  lines.push("};", "");
  fs.writeFileSync(OUT_FILE, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${keys.length} procedure rules → ${path.relative(ROOT, OUT_FILE)}`);
}

main();

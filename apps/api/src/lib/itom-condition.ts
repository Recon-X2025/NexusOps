/**
 * itom-condition.ts — a small boolean-expression DSL for ITOM suppression rules
 * and correlation policies (Sprint 3.4b).
 *
 * The `itom_suppression_rules.condition` and `itom_correlation_policies.condition`
 * columns store free-text expressions like:
 *   "count > 10 AND severity = critical"
 *   "node = db-01 AND (metric = cpu_load OR metric = disk_usage)"
 * Historically these were stored but never evaluated. This module parses and
 * evaluates them against an event-shaped record.
 *
 * Grammar (recursive descent):
 *   expr       := term (OR term)*
 *   term       := factor (AND factor)*
 *   factor     := '(' expr ')' | comparison
 *   comparison := field OP value
 *
 * Fields:  count | severity | node | metric | state | value | threshold
 * Ops:     = | != | > | >= | < | <=
 * AND / OR are case-insensitive.
 *
 * Semantics:
 *   - Numeric fields (count, value, threshold) coerce operands to number; a
 *     non-numeric operand on a numeric comparison evaluates to `false` at eval
 *     time (never throws).
 *   - `severity` is ordinal (critical > major > minor > warning > info > clear),
 *     so `severity >= major` works.
 *   - Other string fields (node, metric, state) support only `=` / `!=`; using
 *     an order operator (`>`, `<`, …) on them is a *parse* error.
 *
 * The parser throws `ConditionParseError` on malformed input. Callers should
 * catch it and treat the rule/policy as non-matching (and log) — a bad
 * condition string must never crash ingestion or the sweep.
 */

export class ConditionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConditionParseError";
  }
}

export type ComparisonOp = "=" | "!=" | ">" | ">=" | "<" | "<=";

export type ConditionField =
  | "count"
  | "severity"
  | "node"
  | "metric"
  | "state"
  | "value"
  | "threshold";

const NUMERIC_FIELDS: ReadonlySet<string> = new Set(["count", "value", "threshold"]);
const STRING_ONLY_FIELDS: ReadonlySet<string> = new Set(["node", "metric", "state"]);
const KNOWN_FIELDS: ReadonlySet<string> = new Set([
  "count",
  "severity",
  "node",
  "metric",
  "state",
  "value",
  "threshold",
]);

/** Ordinal rank for severity comparisons (higher = more severe). */
const SEVERITY_RANK: Record<string, number> = {
  critical: 5,
  major: 4,
  minor: 3,
  warning: 2,
  info: 1,
  clear: 0,
};

const ORDER_OPS: ReadonlySet<ComparisonOp> = new Set([">", ">=", "<", "<="]);

export type ConditionNode =
  | { kind: "and"; left: ConditionNode; right: ConditionNode }
  | { kind: "or"; left: ConditionNode; right: ConditionNode }
  | { kind: "cmp"; field: ConditionField; op: ComparisonOp; value: string };

/** The shape an event must provide for evaluation. */
export interface EvaluableEvent {
  count?: number | null;
  severity?: string | null;
  node?: string | null;
  metric?: string | null;
  state?: string | null;
  value?: string | null;
  threshold?: string | null;
}

// ── Tokenizer ────────────────────────────────────────────────────────────────

type Token =
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "and" }
  | { type: "or" }
  | { type: "op"; op: ComparisonOp }
  | { type: "ident"; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const ch = src[i]!;

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }

    // Multi/single-char operators. Order matters: check two-char forms first.
    const two = src.slice(i, i + 2);
    if (two === ">=" || two === "<=" || two === "!=") {
      tokens.push({ type: "op", op: two as ComparisonOp });
      i += 2;
      continue;
    }
    if (ch === "=" || ch === ">" || ch === "<") {
      tokens.push({ type: "op", op: ch as ComparisonOp });
      i++;
      continue;
    }

    // Quoted string literal ('...' or "...").
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let buf = "";
      while (j < n && src[j] !== quote) {
        buf += src[j];
        j++;
      }
      if (j >= n) throw new ConditionParseError(`Unterminated string literal in: ${src}`);
      tokens.push({ type: "ident", value: buf });
      i = j + 1;
      continue;
    }

    // Bare word: identifier / keyword / number. Terminated by whitespace,
    // parens, or an operator char.
    if (/[A-Za-z0-9_.\-+]/.test(ch)) {
      let j = i;
      let buf = "";
      while (j < n && /[A-Za-z0-9_.\-+]/.test(src[j]!)) {
        buf += src[j];
        j++;
      }
      const lower = buf.toLowerCase();
      if (lower === "and") tokens.push({ type: "and" });
      else if (lower === "or") tokens.push({ type: "or" });
      else tokens.push({ type: "ident", value: buf });
      i = j;
      continue;
    }

    throw new ConditionParseError(`Unexpected character '${ch}' in: ${src}`);
  }

  return tokens;
}

// ── Parser (recursive descent) ────────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[], private readonly src: string) {}

  parse(): ConditionNode {
    const node = this.parseExpr();
    if (this.pos !== this.tokens.length) {
      throw new ConditionParseError(`Unexpected trailing tokens in: ${this.src}`);
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new ConditionParseError(`Unexpected end of expression in: ${this.src}`);
    this.pos++;
    return t;
  }

  private parseExpr(): ConditionNode {
    let left = this.parseTerm();
    while (this.peek()?.type === "or") {
      this.next();
      const right = this.parseTerm();
      left = { kind: "or", left, right };
    }
    return left;
  }

  private parseTerm(): ConditionNode {
    let left = this.parseFactor();
    while (this.peek()?.type === "and") {
      this.next();
      const right = this.parseFactor();
      left = { kind: "and", left, right };
    }
    return left;
  }

  private parseFactor(): ConditionNode {
    const t = this.peek();
    if (!t) throw new ConditionParseError(`Unexpected end of expression in: ${this.src}`);
    if (t.type === "lparen") {
      this.next();
      const inner = this.parseExpr();
      const close = this.next();
      if (close.type !== "rparen") {
        throw new ConditionParseError(`Expected ')' in: ${this.src}`);
      }
      return inner;
    }
    return this.parseComparison();
  }

  private parseComparison(): ConditionNode {
    const fieldTok = this.next();
    if (fieldTok.type !== "ident") {
      throw new ConditionParseError(`Expected a field name in: ${this.src}`);
    }
    const field = fieldTok.value.toLowerCase();
    if (!KNOWN_FIELDS.has(field)) {
      throw new ConditionParseError(`Unknown field '${fieldTok.value}' in: ${this.src}`);
    }

    const opTok = this.next();
    if (opTok.type !== "op") {
      throw new ConditionParseError(`Expected a comparison operator after '${field}' in: ${this.src}`);
    }
    const op = opTok.op;

    if (STRING_ONLY_FIELDS.has(field) && ORDER_OPS.has(op)) {
      throw new ConditionParseError(
        `Order operator '${op}' is not allowed on string field '${field}' in: ${this.src}`,
      );
    }

    const valTok = this.next();
    if (valTok.type !== "ident") {
      throw new ConditionParseError(`Expected a value after '${field} ${op}' in: ${this.src}`);
    }

    return { kind: "cmp", field: field as ConditionField, op, value: valTok.value };
  }
}

/** Parse a condition string into an evaluable AST. Throws ConditionParseError. */
export function parseCondition(src: string): ConditionNode {
  if (typeof src !== "string" || src.trim() === "") {
    throw new ConditionParseError("Empty condition");
  }
  const tokens = tokenize(src);
  if (tokens.length === 0) throw new ConditionParseError("Empty condition");
  return new Parser(tokens, src).parse();
}

// ── Evaluator ─────────────────────────────────────────────────────────────────

function compareNumbers(a: number, b: number, op: ComparisonOp): boolean {
  switch (op) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
  }
}

function compareStrings(a: string, b: string, op: ComparisonOp): boolean {
  switch (op) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    default:
      // Order operators on plain strings never reach here (blocked at parse
      // time for string-only fields); guard defensively.
      return false;
  }
}

function evalComparison(node: Extract<ConditionNode, { kind: "cmp" }>, event: EvaluableEvent): boolean {
  const { field, op, value } = node;

  if (field === "severity") {
    const eventSev = (event.severity ?? "").toLowerCase();
    const targetSev = value.toLowerCase();
    const a = SEVERITY_RANK[eventSev];
    const b = SEVERITY_RANK[targetSev];
    if (a === undefined || b === undefined) return false; // unknown severity → non-match
    return compareNumbers(a, b, op);
  }

  if (NUMERIC_FIELDS.has(field)) {
    const raw = event[field];
    const a = raw == null ? NaN : Number(raw);
    const b = Number(value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false; // non-numeric → non-match
    return compareNumbers(a, b, op);
  }

  // String-only field (node, metric, state).
  const a = event[field] ?? "";
  return compareStrings(String(a), value, op);
}

/** Evaluate a parsed condition AST against an event. Never throws. */
export function evaluateCondition(node: ConditionNode, event: EvaluableEvent): boolean {
  switch (node.kind) {
    case "and":
      return evaluateCondition(node.left, event) && evaluateCondition(node.right, event);
    case "or":
      return evaluateCondition(node.left, event) || evaluateCondition(node.right, event);
    case "cmp":
      return evalComparison(node, event);
  }
}

/**
 * Convenience: parse + evaluate in one call. Returns `false` (never throws) when
 * the condition string is malformed — the caller decides whether to log.
 */
export function matchesCondition(src: string, event: EvaluableEvent): boolean {
  let ast: ConditionNode;
  try {
    ast = parseCondition(src);
  } catch {
    return false;
  }
  return evaluateCondition(ast, event);
}

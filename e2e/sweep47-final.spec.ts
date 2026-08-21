/**
 * SWEEP 47 — FINAL PASS over every screen still NOT-RUN.
 *
 * Fixes the three harness defects that blocked batches 4-9:
 *   1. NAV — click the sidebar anchor BY HREF. "Field Service" matched the
 *      workbench link before the module link, so work-orders never loaded.
 *   2. TYPE-AWARE FILL — a token typed into a numeric field is what broke
 *      `sam` (costPerSeat:'SW47…'). Fill by input type, not blindly.
 *   3. TAB WALK — several create controls sit behind a non-default tab, and a
 *      reload returns to the default tab (which is why surveys/legal "lost"
 *      a row that was in fact saved). Walk tabs to find the control, and
 *      restore the tab before asserting.
 *
 * `page.goto` is used once per test, for /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

type Screen = { route: string; nav: string };

const SCREENS: Screen[] = [
  { route: "devops", nav: "DevOps" },
];

const CREATE_RE = /^(New|Add|Create|Log|Raise|Issue|Register|Start|Record)\b/i;
const SUBMIT_RE = /^(Save|Create|Submit|Add|Confirm|Register|Issue|Generate|Declare|Post|Send|Log|Record|Finish|Done|Apply)\b/i;
const NEXT_RE   = /^(Next|Continue)\b/i;

async function loginAs(page: Page) {
  await page.goto("/login"); // the only permitted goto
  await page.fill('[data-testid="login-email"]', "admin@coheron.com");
  await page.fill('[data-testid="login-password"]', "demo1234!");
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 25_000 });
}

/** Fill every visible control, respecting its type. Returns count filled. */
/** The open modal/dialog, if any — else the whole page. */
async function scopeOf(page: Page) {
  const cands = ['[role="dialog"]', "div.fixed.inset-0", "div.max-w-lg", "div.max-w-md", "div.max-w-2xl", "div.max-w-xl"];
  for (const c of cands) {
    const loc = page.locator(c);
    const n = await loc.count();
    for (let i = n - 1; i >= 0; i--) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      if ((await el.locator("button").count()) < 1) continue;
      if ((await el.locator("input,select,textarea").count()) < 1
          && (await el.locator("button").count()) < 2) continue;
      return el;
    }
  }
  return page.locator("body");
}

async function fillAll(page: Page, token: string): Promise<number> {
  let filled = 0;
  const today = new Date().toISOString().slice(0, 10);

  const root = await scopeOf(page);
  const setIf = async (sel: string, value: string) => {
    const loc = root.locator(sel);
    for (let i = 0; i < (await loc.count()); i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      if (await el.isDisabled().catch(() => true)) continue;
      const ph = (await el.getAttribute("placeholder")) ?? "";
      if (/filter navigator|search records|^search/i.test(ph)) continue;
      if (await el.evaluate((n: any) => n.readOnly === true).catch(() => false)) continue;
      await el.fill(value).catch(() => {});
      filled++;
    }
  };

  await setIf('input[type="number"]:not([readonly])', "100");
  await setIf('input[type="date"]', today);
  await setIf('input[type="email"]', `sw47.${token.toLowerCase()}@coheron.com`);
  await setIf('input[type="tel"]', "9000000000");
  await setIf('input[type="url"]', `https://example.com/${token}`);

  // Text-ish fields: choose a value that satisfies the FORMAT the field wants.
  // A token typed into a PAN/GSTIN/IFSC field is rejected server-side (that is
  // what broke `vendors`: "PAN must be in format AAAAA9999A").
  const texts = root.locator('input:not([type]), input[type="text"], textarea');
  for (let i = 0; i < (await texts.count()); i++) {
    const el = texts.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if (await el.isDisabled().catch(() => true)) continue;
    if (await el.evaluate((n: any) => n.readOnly === true).catch(() => false)) continue;
    const ctx = (await el.evaluate((n: any) => {
      const lab = n.closest("label")?.textContent
        ?? n.parentElement?.querySelector("label")?.textContent
        ?? n.previousElementSibling?.textContent ?? "";
      return `${lab} ${n.placeholder ?? ""} ${n.name ?? ""}`;
    }).catch(() => "")).toLowerCase();
    if (/filter navigator|search records/.test(ctx)) continue;
    let v = token;
    if (/\bpan\b/.test(ctx))            v = "ABCDE1234F";
    else if (/gstin|gst no/.test(ctx))   v = "29ABCDE1234F1Z5";
    else if (/ifsc/.test(ctx))           v = "HDFC0001234";
    else if (/uan/.test(ctx))            v = "100200300400";
    else if (/tan\b/.test(ctx))          v = "BLRA12345B";
    else if (/cin\b/.test(ctx))          v = "U72200KA2020PTC123456";
    else if (/aadhaar/.test(ctx))        v = "999999999999";
    else if (/account number|acc no/.test(ctx)) v = "123456789012";
    else if (/phone|mobile|contact no/.test(ctx)) v = "9000000000";
    else if (/email/.test(ctx))          v = `sw47.${token.toLowerCase()}@coheron.com`;
    else if (/url|website|link/.test(ctx)) v = "https://example.com";
    else if (/cost|price|amount|qty|quantity|seats|rate|percent|value|total|budget|days|count/.test(ctx)) v = "100";
    await el.fill(v).catch(() => {});
    filled++;
  }

  const sels = root.locator("select:not([disabled])");
  for (let i = 0; i < (await sels.count()); i++) {
    const el = sels.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const vals = await el.locator("option").evaluateAll((o) =>
      (o as HTMLOptionElement[]).map((x) => x.value).filter(Boolean));
    if (vals.length) { await el.selectOption(vals[0]!).catch(() => {}); filled++; }
  }
  return filled;
}

async function findCreateControl(page: Page, routePrefix: string): Promise<string | null> {
  // Anchors first: several screens create via a dedicated /new ROUTE
  // (work-orders, changes). A button-only scan reports "no create control",
  // which is a harness defect, not a missing feature.
  // MUST belong to THIS screen. Unscoped, this matched the global header
  // "Create" link (/app/tickets/new) and every screen "passed" by creating a
  // ticket — five false passes. Scope to the screen's own route.
  const links = page.locator(`a[href^="/app/${routePrefix}/new"]`);
  for (let i = 0; i < (await links.count()); i++) {
    const a = links.nth(i);
    if (!(await a.isVisible().catch(() => false))) continue;
    const label = ((await a.textContent()) ?? "").trim() || (await a.getAttribute("href")) || "link";
    await a.click().catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    return `link:${label}`;
  }
  const buttons = page.getByRole("button");
  for (let i = 0; i < (await buttons.count()); i++) {
    const b = buttons.nth(i);
    const label = ((await b.textContent()) ?? "").trim();
    if (!CREATE_RE.test(label) || label.length > 40) continue;
    if (!(await b.isVisible().catch(() => false))) continue;
    if (await b.isDisabled().catch(() => true)) continue;
    await b.click().catch(() => {});
    return label;
  }
  return null;
}

test.describe("SWEEP47 FINAL", () => {
  for (const s of SCREENS) {
    test(`${s.route} — create round-trips`, async ({ page }) => {
      const token = `SW47${Date.now().toString().slice(-7)}`;
      const notes: string[] = [];
      await loginAs(page);

      // ── 1. Reach the screen by clicking its sidebar anchor, BY HREF ──────
      const href = `/app/${s.route}`;
      if (s.nav) {
        const filter = page.getByPlaceholder("Filter navigator...");
        await filter.click();
        await filter.fill(s.nav);
        await page.waitForTimeout(400);
      }
      const anchor = page.locator(`a[href="${href}"]`).first();
      if (!(await anchor.count())) {
        notes.push("NO-ANCHOR-ANYWHERE (unreachable by clicking)");
        console.log(`[FIN/${s.route}] ${notes.join(" | ")}`);
        expect(await anchor.count(), `${s.route}: no clickable link exists in the UI`).toBeGreaterThan(0);
        return;
      }
      await anchor.click();
      await page.waitForURL(new RegExp(href.replace(/\//g, "\\/")), { timeout: 25_000 });
      await page.waitForLoadState("networkidle");
      notes.push("reached");

      // ── 2. Walk tabs until a create control appears ──────────────────────
      let control = await findCreateControl(page, s.route);
      let tabUsed = "(default)";
      if (!control) {
        const tabs = page.getByRole("button");
        const labels: string[] = [];
        for (let i = 0; i < (await tabs.count()); i++) {
          const t = ((await tabs.nth(i).textContent()) ?? "").trim();
          if (t && t.length < 30 && !CREATE_RE.test(t)) labels.push(t);
        }
        for (const lab of labels.slice(0, 14)) {
          const tb = page.getByRole("button", { name: lab, exact: true }).first();
          if (!(await tb.count())) continue;
          await tb.click().catch(() => {});
          await page.waitForTimeout(500);
          control = await findCreateControl(page, s.route);
          if (control) { tabUsed = lab; break; }
        }
      }
      if (!control) {
        notes.push("NO-CREATE-CONTROL-ON-ANY-TAB");
        console.log(`[FIN/${s.route}] ${notes.join(" | ")}`);
        expect(control, `${s.route}: no create control on any tab`).not.toBeNull();
        return;
      }
      notes.push(`tab="${tabUsed}" control="${control}"`);
      await page.waitForTimeout(800);

      // ── 3. Fill (type-aware), twice — the 2nd pass catches fields that only
      //       appear after a select changes. ─────────────────────────────────
      let totalFilled = 0;
      for (let step = 0; step < 4; step++) {
        totalFilled += await fillAll(page, token);
        await page.waitForTimeout(400);
        totalFilled += await fillAll(page, token); // async-populated selects
        const nxt = (await scopeOf(page)).getByRole("button", { name: NEXT_RE }).first();
        if ((await nxt.count()) && (await nxt.isVisible().catch(() => false))
            && !(await nxt.isDisabled().catch(() => true))) {
          await nxt.click().catch(() => {});
          notes.push(`next#${step + 1}`);
          await page.waitForTimeout(900);
          continue;
        }
        break;
      }
      notes.push(`filled=${totalFilled}`);

      // ── 4. Submit ────────────────────────────────────────────────────────
      const submitRoot = await scopeOf(page);
      const sb = submitRoot.getByRole("button");
      let submitted = "";
      for (let i = (await sb.count()) - 1; i >= 0; i--) {
        const b = sb.nth(i);
        const label = ((await b.textContent()) ?? "").trim();
        if (!SUBMIT_RE.test(label) || label.length > 40) continue;
        if (!(await b.isVisible().catch(() => false))) continue;
        if (await b.isDisabled().catch(() => true)) continue;
        await b.click().catch(() => {});
        submitted = label;
        break;
      }
      if (!submitted) {
        notes.push("NO-ENABLED-SUBMIT");
        console.log(`[FIN/${s.route}] ${notes.join(" | ")}`);
        expect(submitted, `${s.route}: no enabled submit`).not.toBe("");
        return;
      }
      notes.push(`submit="${submitted}"`);
      await page.waitForTimeout(2500);

      // ── 5. Reload, restore the tab, assert the token returned ────────────
      await page.reload();
      await page.waitForLoadState("networkidle");
      if (tabUsed !== "(default)") {
        await page.getByRole("button", { name: tabUsed, exact: true }).first().click().catch(() => {});
        await page.waitForTimeout(900);
      }
      const body = (await page.locator("body").textContent()) ?? "";
      const found = body.includes(token);
      notes.push(found ? "TOKEN-FOUND-AFTER-RELOAD" : "TOKEN-ABSENT-AFTER-RELOAD");
      console.log(`[FIN/${s.route}] ${notes.join(" | ")}`);
      expect(found, `${s.route}: token ${token} did not survive a reload`).toBe(true);
    });
  }
});

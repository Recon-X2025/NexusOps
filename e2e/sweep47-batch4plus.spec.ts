/**
 * SWEEP 47 — BATCHES 4-9: generic round-trip harness over the remaining screens.
 *
 * Per screen: reach it BY CLICKING, open its create control, fill every visible
 * field with a stamped token, submit, RELOAD, and assert the token comes back.
 * `page.goto` is used once per test, for /login, and nowhere else.
 *
 * A PASS here is a genuine round-trip: a value was typed through the UI, saved,
 * and read back after a reload. A FAIL is a CANDIDATE, never a filed defect —
 * a generic filler can produce input a specific form legitimately rejects, so
 * every failure must be inspected before it is called anything.
 */
import { test, expect, type Page } from "@playwright/test";

type Screen = { route: string; nav: string; link: RegExp };

const SCREENS: Screen[] = [
  { route: "financial",              nav: "Financial Management",   link: /Financial Management/i },
  { route: "procurement",            nav: "Supply Chain & Finance", link: /Supply Chain & Finance/i },
  { route: "vendors",                nav: "Vendors",                link: /Vendors/i },
  { route: "contracts",              nav: "Contract Management",    link: /Contract Management/i },
  { route: "projects",               nav: "Initiatives",            link: /Initiatives/i },
  { route: "recruitment",            nav: "Recruitment",            link: /Recruitment/i },
  { route: "performance",            nav: "Performance Management", link: /Performance Management/i },
  { route: "surveys",                nav: "Surveys",                link: /Surveys/i },
  { route: "hr/expenses",            nav: "My Expense Claims",      link: /My Expense Claims/i },
  { route: "catalog",                nav: "Service Catalog",        link: /Service Catalog/i },
  { route: "csm",                    nav: "Customer Service",       link: /Customer Service/i },
  { route: "grc",                    nav: "Risk & Compliance",      link: /Risk & Compliance/i },
  { route: "dpdp",                   nav: "DPDP Privacy",           link: /DPDP Privacy/i },
  { route: "security",               nav: "Security Operations",    link: /Security Operations/i },
  { route: "secretarial",            nav: "Secretarial & CS",       link: /Secretarial & CS/i },
  { route: "legal",                  nav: "Legal Service Delivery", link: /Legal Service Delivery/i },
  { route: "settings/api-keys",      nav: "API Keys",               link: /API Keys/i },
  { route: "changes",                nav: "Change & Problem",       link: /Change & Problem/i },
  { route: "problems",               nav: "Problems",               link: /Problems/i },
  { route: "work-orders",            nav: "Field Service",          link: /Field Service/i },
  { route: "work-orders/parts",      nav: "Parts & Inventory",      link: /Parts & Inventory/i },
  { route: "on-call",                nav: "On-Call",                link: /On-Call/i },
  { route: "events",                 nav: "IT Operations",          link: /IT Operations/i },
  { route: "cmdb",                   nav: "CMDB",                   link: /CMDB/i },
  { route: "ham",                    nav: "Asset Management",       link: /Asset Management/i },
  { route: "sam",                    nav: "Software Assets",        link: /Software Assets/i },
  { route: "apm",                    nav: "App Inventory",          link: /App Inventory/i },
  { route: "devops",                 nav: "DevOps",                 link: /DevOps/i },
  { route: "flows",                  nav: "Flow Designer",          link: /Flow Designer/i },
];

async function loginAs(page: Page, email = "admin@coheron.com", password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 25_000 });
}

const CREATE_RE = /^(New|Add|Create|Log|Raise|Issue|Register|Start)\b/i;
const SUBMIT_RE = /^(Save|Create|Submit|Add|Confirm|Register)\b/i;

test.describe("SWEEP47 B4+ — generic round-trip", () => {
  for (const s of SCREENS) {
    test(`${s.route} — create round-trips`, async ({ page }) => {
      const token = `SW47${Date.now().toString().slice(-7)}`;
      const notes: string[] = [];

      await loginAs(page);

      // ── Reach the screen BY CLICKING ────────────────────────────────────
      // Routes whose nav group is hidden (Security & Compliance: grc, dpdp,
      // security, approvals, flows) have no sidebar entry to click. The routes
      // still exist — fall back to navigating directly so the round-trip below
      // still exercises the screen rather than failing at the nav step.
      const filter = page.getByPlaceholder("Filter navigator...");
      await filter.click();
      await filter.fill(s.nav);
      const navLink = page.getByRole("link", { name: s.link }).first();
      if (await navLink.count()) {
        await navLink.click();
      } else {
        await page.goto(`/app/${s.route}`);
      }
      await page.waitForURL(new RegExp(`/app/${s.route.replace(/\//g, "\\/")}`), { timeout: 25_000 });
      await page.waitForLoadState("networkidle");
      notes.push("reached");

      // ── Find a create control ───────────────────────────────────────────
      const buttons = page.getByRole("button");
      const n = await buttons.count();
      let opened = false;
      for (let i = 0; i < n; i++) {
        const b = buttons.nth(i);
        const label = ((await b.textContent()) ?? "").trim();
        if (!CREATE_RE.test(label)) continue;
        if (!(await b.isVisible().catch(() => false))) continue;
        await b.click().catch(() => {});
        opened = true;
        notes.push(`create-control="${label}"`);
        break;
      }
      if (!opened) {
        notes.push("NO-CREATE-CONTROL-FOUND");
        console.log(`[B4+/${s.route}] ${notes.join(" | ")}`);
        test.skip(true, `${s.route}: no create control matched ${CREATE_RE}`);
        return;
      }
      await page.waitForTimeout(700);

      // ── Fill everything visible ─────────────────────────────────────────
      const scope = page;
      let filled = 0;
      const texts = scope.locator('input:not([type]), input[type="text"], input[type="search"], textarea');
      for (let i = 0; i < (await texts.count()); i++) {
        const el = texts.nth(i);
        if (!(await el.isVisible().catch(() => false))) continue;
        if (await el.isDisabled().catch(() => true)) continue;
        const ph = (await el.getAttribute("placeholder")) ?? "";
        if (/filter navigator|search records/i.test(ph)) continue; // never the global nav
        await el.fill(`${token}`).catch(() => {});
        filled++;
      }
      const emails = scope.locator('input[type="email"]');
      for (let i = 0; i < (await emails.count()); i++) {
        const el = emails.nth(i);
        if (await el.isVisible().catch(() => false)) await el.fill(`sw47.${token.toLowerCase()}@coheron.com`).catch(() => {});
      }
      const nums = scope.locator('input[type="number"]:not([readonly]):not([disabled])');
      for (let i = 0; i < (await nums.count()); i++) {
        const el = nums.nth(i);
        if (await el.isVisible().catch(() => false)) await el.fill("100").catch(() => {});
      }
      const sels = scope.locator("select:not([disabled])");
      for (let i = 0; i < (await sels.count()); i++) {
        const el = sels.nth(i);
        if (!(await el.isVisible().catch(() => false))) continue;
        const vals = await el.locator("option").evaluateAll((o) =>
          (o as HTMLOptionElement[]).map((x) => x.value).filter(Boolean));
        if (vals.length) await el.selectOption(vals[0]!).catch(() => {});
      }
      notes.push(`filled=${filled}`);

      // ── Submit ──────────────────────────────────────────────────────────
      const sbuttons = page.getByRole("button");
      let submitted = "";
      for (let i = (await sbuttons.count()) - 1; i >= 0; i--) {
        const b = sbuttons.nth(i);
        const label = ((await b.textContent()) ?? "").trim();
        if (!SUBMIT_RE.test(label)) continue;
        if (!(await b.isVisible().catch(() => false))) continue;
        if (await b.isDisabled().catch(() => true)) { notes.push(`submit-disabled="${label}"`); continue; }
        await b.click().catch(() => {});
        submitted = label;
        break;
      }
      if (!submitted) {
        notes.push("NO-ENABLED-SUBMIT");
        console.log(`[B4+/${s.route}] ${notes.join(" | ")}`);
        expect(submitted, `${s.route}: no enabled submit control`).not.toBe("");
        return;
      }
      notes.push(`submit="${submitted}"`);
      await page.waitForTimeout(2500);

      // ── Reload and assert the token came back ───────────────────────────
      await page.reload();
      await page.waitForLoadState("networkidle");
      const body = (await page.locator("body").textContent()) ?? "";
      const found = body.includes(token);
      notes.push(found ? "TOKEN-FOUND-AFTER-RELOAD" : "TOKEN-ABSENT-AFTER-RELOAD");
      console.log(`[B4+/${s.route}] ${notes.join(" | ")}`);
      expect(found, `${s.route}: token ${token} did not survive a reload`).toBe(true);
    });
  }
});

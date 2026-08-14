/**
 * LOGIN-PASSWORD-IN-URL guard.
 * ─────────────────────────────────────────────────────────────────────────────
 * A `<form>` with no `method` defaults to GET. If a credential form is submitted before React
 * hydrates (slow load, cold cache, Enter before JS attaches), the native submit puts the email +
 * password into the URL query string (`/login?email=…&password=…`) — and URLs land in browser
 * history, server access logs, and any intermediate proxy. `method="post"` is the belt: a native
 * submit then carries the fields in the request body, never the URL, regardless of hydration.
 *
 * Component-render infra (@testing-library/react) is not installed here, so this is a SOURCE guard,
 * asserted plainly: every credential/auth form's opening `<form>` tag must carry `method="post"`.
 * It fails the build the moment one is added or reverted without it.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const APP = join(dirname(fileURLToPath(import.meta.url)), "../../app");

// Every page that submits credentials or a token-bound secret.
const AUTH_PAGES = [
  "login/page.tsx",
  "signup/page.tsx",
  "forgot-password/page.tsx",
  "reset-password/[token]/page.tsx",
  "invite/[token]/page.tsx",
];

/** Opening `<form …>` tags that wire a JS submit handler (the hydration-dependent ones). */
function submitFormTags(src: string): string[] {
  const out: string[] = [];
  const re = /<form\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (/onSubmit=/.test(m[0])) out.push(m[0]);
  }
  return out;
}

describe("auth forms carry method=\"post\" (LOGIN-PASSWORD-IN-URL guard)", () => {
  for (const rel of AUTH_PAGES) {
    it(`${rel} — every onSubmit form is method="post"`, () => {
      const src = readFileSync(join(APP, rel), "utf8");
      const forms = submitFormTags(src);
      expect(forms.length).toBeGreaterThan(0); // the page has a credential form at all
      for (const tag of forms) {
        expect(tag, `form in ${rel} must POST, not GET: ${tag}`).toMatch(/method="post"/);
      }
    });
  }
});

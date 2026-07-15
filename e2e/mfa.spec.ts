/**
 * TOTP MFA end-to-end flow (Phase 3 security).
 *
 * Exercises the whole loop through the real UI against the running API:
 *   1. enrol the seeded admin in TOTP from the profile Security tab,
 *   2. log out and log back in — asserting the two-step MFA challenge appears —
 *      and finish with a live TOTP code,
 *   3. tear down by disabling MFA so the shared seeded admin is restored
 *      (E2E runs single-worker with shared state; leaving MFA on would break
 *      every later spec that logs in as admin).
 *
 * The TOTP code is computed locally with Node's crypto (RFC 6238, SHA1, 6
 * digits, 30s period) so the test carries no extra dependency on otplib.
 */
import crypto from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@coheron.com";
const ADMIN_PASSWORD = "demo1234!";

// ---- RFC 6238 TOTP (matches otplib defaults: base32 secret, SHA1, 6 digits) ----

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** Generate the current 6-digit TOTP for a base32 secret. */
function totp(secret: string, forTime = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(forTime / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (bin % 1_000_000).toString().padStart(6, "0");
}

// ---- helpers ----

async function loginWithPassword(page: Page) {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', ADMIN_EMAIL);
  await page.fill('[data-testid="login-password"]', ADMIN_PASSWORD);
  await page.click('[data-testid="login-submit"]');
}

async function logout(page: Page) {
  // Clear the dual session storage (localStorage + cookie) and return to /login.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.evaluate(() => localStorage.removeItem("coheronconnect_session"));
}

test.describe("MFA (TOTP) end-to-end", () => {
  // The heaviest browser flow in the suite (two logins + enrol + disable, each
  // hitting bcrypt on the API); give it generous headroom.
  test.setTimeout(120_000);

  test("enrol, then password + TOTP login, then disable", async ({ page }) => {
    // 1) Log in normally (admin has no MFA yet) and open the Security tab.
    // First navigation can be slow while Next dev compiles the /app routes on
    // demand, so allow extra time here.
    await loginWithPassword(page);
    await page.waitForURL(/app\/command/, { timeout: 45_000 });

    await page.goto("/app/profile?tab=security");
    const enableBtn = page.getByRole("button", { name: "Enable 2FA" });
    await expect(enableBtn).toBeVisible();
    await enableBtn.click();

    // The enrolment panel shows the base32 secret in a <code> block.
    const secretCode = page.locator("code").first();
    await expect(secretCode).toBeVisible({ timeout: 10_000 });
    const secret = ((await secretCode.textContent()) ?? "").trim();
    expect(secret.length).toBeGreaterThan(0);

    // Confirm with a live code.
    await page.getByPlaceholder("123456").fill(totp(secret));
    await page.getByRole("button", { name: "Confirm" }).click();

    // Backup codes modal appears once — dismiss it.
    const savedBtn = page.getByRole("button", { name: /I've saved them/i });
    await expect(savedBtn).toBeVisible({ timeout: 10_000 });
    await savedBtn.click();
    // Exact match: a "Two-factor authentication enabled" toast also contains "Enabled".
    await expect(page.getByText("Enabled", { exact: true })).toBeVisible();

    // 2) Log out and log back in — password now yields the MFA challenge.
    await logout(page);
    await loginWithPassword(page);

    await expect(
      page.getByRole("heading", { name: "Two-factor authentication" }),
    ).toBeVisible({ timeout: 30_000 });

    // Fresh code (in case the 30s window rolled over during the flow).
    await page.locator('[data-testid="mfa-code"]').fill(totp(secret));
    await page.locator('[data-testid="mfa-submit"]').click();
    await page.waitForURL(/app\/command/, { timeout: 15_000 });

    // 3) Teardown: disable MFA so the shared admin is restored for later specs.
    await page.goto("/app/profile?tab=security");
    await page.getByRole("button", { name: "Disable 2FA" }).click();
    await page.getByPlaceholder("123456").fill(totp(secret));
    await page.getByRole("button", { name: "Confirm disable" }).click();
    await expect(page.getByText("Not enabled", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});

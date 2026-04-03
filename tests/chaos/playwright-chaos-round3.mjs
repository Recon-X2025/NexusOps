/**
 * NexusOps · Playwright Full-System Chaos Test — Round 3 (v2)
 * 40 browser sessions, 50–100 random actions each
 * Target: http://139.84.154.78
 */

import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE = 'http://139.84.154.78';
const SESSIONS = 40;
const MIN_ACTIONS = 50;
const MAX_ACTIONS = 80;
const BATCH_SIZE = 8; // run 8 in parallel (server has limited resources)

const USERS = [
  { email: 'admin@coheron.com',    password: 'demo1234!', role: 'admin' },
  { email: 'agent1@coheron.com',   password: 'demo1234!', role: 'itil' },
  { email: 'agent2@coheron.com',   password: 'demo1234!', role: 'operator_field' },
  { email: 'hr@coheron.com',       password: 'demo1234!', role: 'hr_manager' },
  { email: 'finance@coheron.com',  password: 'demo1234!', role: 'finance_manager' },
  { email: 'employee@coheron.com', password: 'demo1234!', role: 'requester' },
  { email: 'viewer@coheron.com',   password: 'demo1234!', role: 'report_viewer' },
];

const APP_PAGES = [
  '/app/dashboard',
  '/app/tickets',
  '/app/projects',
  '/app/crm',
  '/app/approvals',
  '/app/hr',
  '/app/finance',
  '/app/changes',
  '/app/contracts',
  '/app/ham',
  '/app/sam',
  '/app/cmdb',
  '/app/grc',
  '/app/vendors',
  '/app/on-call',
  '/app/devops',
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const rand   = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep  = (ms) => new Promise(r => setTimeout(r, ms));
const pick   = (arr) => arr[Math.floor(Math.random() * arr.length)];
const stamp  = () => new Date().toISOString().slice(11,19);

// ── Shared results ────────────────────────────────────────────────────────────
const R = {
  sessionsTotal: 0,
  sessionsSucceeded: 0,
  sessionsFailed: 0,
  loginFailures: 0,
  totalActions: 0,
  totalErrors: 0,
  categories: {
    navigationFailure: 0,
    consoleError: 0,
    pageTimeout: 0,
    uncaughtException: 0,
    duplicateAction: 0,
    rbacViolation: 0,
    uiFreeze: 0,
    formError: 0,
  },
  pageFailures: {},
  rbacViolations: [],
  brokenFlows: [],
  rawErrors: [],
  sessionLogs: [],
};

function addError(cat, detail, page) {
  R.totalErrors++;
  R.categories[cat] = (R.categories[cat] || 0) + 1;
  if (page) R.pageFailures[page] = (R.pageFailures[page] || 0) + 1;
  R.rawErrors.push({ cat, detail: String(detail).slice(0, 250), page: page || null });
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function doLogin(page, user, sid) {
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(rand(300, 700));

    // Use data-testid selectors from the actual DOM
    await page.waitForSelector('[data-testid="login-email"]', { timeout: 12000 });
    await page.fill('[data-testid="login-email"]', user.email);
    await sleep(rand(50, 150));
    await page.fill('[data-testid="login-password"]', user.password);
    await sleep(rand(50, 150));
    await page.click('[data-testid="login-submit"]');

    // Wait for redirect away from /login — u is a URL object in Playwright
    await page.waitForURL(u => !u.href.includes('/login'), { timeout: 20000 });
    log(sid, `✓ Login OK → ${page.url().replace(BASE, '')}`);
    return true;
  } catch (e) {
    R.loginFailures++;
    addError('navigationFailure', `Login failed [${user.email}]: ${e.message}`, '/login');
    log(sid, `✗ Login FAILED for ${user.email}: ${e.message.slice(0, 80)}`);
    return false;
  }
}

// ── Logging helper ────────────────────────────────────────────────────────────
function log(sid, msg) {
  const line = `[${stamp()}][S${String(sid).padStart(2,'0')}] ${msg}`;
  process.stdout.write(line + '\n');
  R.sessionLogs.push(line);
}

// ── Action pool ───────────────────────────────────────────────────────────────
const ACTIONS = [

  // 1. Navigate to random page
  async (page, ctx) => {
    const target = pick(APP_PAGES);
    ctx.page = target;
    try {
      await page.goto(`${BASE}${target}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(rand(200, 800));
    } catch (e) {
      addError('navigationFailure', e.message.slice(0, 150), target);
    }
  },

  // 2. Click random visible button
  async (page, ctx) => {
    try {
      const btns = await page.$$('button:visible');
      if (btns.length) { await pick(btns).click({ timeout: 3000 }).catch(() => {}); }
      await sleep(rand(100, 400));
    } catch (_) {}
  },

  // 3. Rapid multi-click (3–6×) on a button
  async (page, ctx) => {
    try {
      const btns = await page.$$('button:visible');
      if (btns.length) {
        const btn = pick(btns);
        const n = rand(3, 6);
        for (let i = 0; i < n; i++) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          await sleep(rand(30, 100));
        }
        addError('duplicateAction', `rapid-click ×${n} on ${ctx.page}`, ctx.page);
      }
    } catch (_) {}
  },

  // 4. Fill input — empty string
  async (page, ctx) => {
    try {
      const inputs = await page.$$('input:visible:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
      if (inputs.length) { await pick(inputs).fill('', { timeout: 2000 }).catch(() => {}); }
    } catch (_) {}
  },

  // 5. Fill input — very long string
  async (page, ctx) => {
    try {
      const inputs = await page.$$('input:visible:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
      if (inputs.length) {
        await pick(inputs).fill('A'.repeat(rand(900, 1200)), { timeout: 2000 }).catch(() => {});
      }
    } catch (_) {}
  },

  // 6. Fill textarea — special characters + XSS payload
  async (page, ctx) => {
    try {
      const tas = await page.$$('textarea:visible');
      if (tas.length) {
        const payload = `<img src=x onerror=alert(1)> '; DROP TABLE tickets;-- 😈 ${'X'.repeat(800)}`;
        await pick(tas).fill(payload, { timeout: 2000 }).catch(() => {});
      }
    } catch (_) {}
  },

  // 7. Submit form multiple times (double / triple submit)
  async (page, ctx) => {
    try {
      const submits = await page.$$('button[type="submit"]:visible');
      if (submits.length) {
        const btn = pick(submits);
        const n = rand(2, 4);
        for (let i = 0; i < n; i++) {
          await btn.click({ timeout: 3000 }).catch(() => {});
          await sleep(rand(50, 200));
        }
        addError('duplicateAction', `form submitted ×${n} on ${ctx.page}`, ctx.page);
      }
    } catch (_) {}
  },

  // 8. Open modal → immediately ESC close
  async (page, ctx) => {
    try {
      const triggers = await page.$$('button:has-text("New"), button:has-text("Add"), button:has-text("Create")');
      if (triggers.length) {
        await pick(triggers).click({ timeout: 3000 }).catch(() => {});
        await sleep(rand(200, 500));
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(rand(100, 300));
      }
    } catch (_) {}
  },

  // 9. Open modal → double-click submit inside
  async (page, ctx) => {
    try {
      const triggers = await page.$$('button:has-text("New"), button:has-text("Create")');
      if (triggers.length) {
        await pick(triggers).click({ timeout: 3000 }).catch(() => {});
        await sleep(rand(300, 600));
        const submits = await page.$$('button[type="submit"]:visible, button:has-text("Save"):visible, button:has-text("Submit"):visible');
        if (submits.length) {
          const btn = pick(submits);
          await btn.click({ timeout: 2000 }).catch(() => {});
          await sleep(rand(40, 120));
          await btn.click({ timeout: 2000 }).catch(() => {}); // double-submit edge case
          addError('duplicateAction', `double-submit in modal on ${ctx.page}`, ctx.page);
        }
      }
    } catch (_) {}
  },

  // 10. Hard reload
  async (page, ctx) => {
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(rand(200, 500));
    } catch (e) { addError('navigationFailure', `reload: ${e.message.slice(0,100)}`, ctx.page); }
  },

  // 11. Navigate mid-load (interrupt)
  async (page, ctx) => {
    const a = pick(APP_PAGES), b = pick(APP_PAGES.filter(p => p !== a));
    try {
      // Attach .catch immediately so rejection is never unhandled
      const p1 = page.goto(`${BASE}${a}`, { timeout: 8000 }).catch(() => {});
      await sleep(rand(60, 300));
      await page.goto(`${BASE}${b}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      ctx.page = b;
      await p1;
    } catch (e) { addError('navigationFailure', `mid-nav: ${e.message.slice(0,100)}`, b); }
  },

  // 12. Back + forward
  async (page, ctx) => {
    try {
      await page.goBack({ timeout: 7000 }).catch(() => {});
      await sleep(rand(100, 300));
      await page.goForward({ timeout: 7000 }).catch(() => {});
      await sleep(rand(100, 300));
    } catch (_) {}
  },

  // 13. Rapid back/forward spam
  async (page, ctx) => {
    try {
      for (let i = 0; i < rand(3, 5); i++) {
        await page.goBack({ timeout: 4000 }).catch(() => {});
        await sleep(rand(40, 120));
        await page.goForward({ timeout: 4000 }).catch(() => {});
        await sleep(rand(40, 120));
      }
    } catch (_) {}
  },

  // 14. RBAC probe — check for data leaks
  async (page, ctx) => {
    try {
      const url = page.url();
      const body = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

      // Non-admin shouldn't see these strings
      if (ctx.user.role !== 'admin') {
        const leaks = ['RBAC Matrix', 'User Management', 'Audit Logs', 'System Settings'];
        for (const leak of leaks) {
          if (body.includes(leak)) {
            R.rbacViolations.push({ user: ctx.user.email, role: ctx.user.role, url, leak });
            addError('rbacViolation', `${ctx.user.role} saw "${leak}" at ${url}`, url);
          }
        }
      }

      // Anyone on /app/dashboard should NOT see "Access Denied" or "403"
      if (url.includes('/app/dashboard') && (body.includes('Access Denied') || body.includes('403 Forbidden'))) {
        R.rbacViolations.push({ user: ctx.user.email, role: ctx.user.role, url, leak: 'Dashboard FORBIDDEN (should be accessible to all)' });
        addError('rbacViolation', `dashboard FORBIDDEN for ${ctx.user.role}`, '/app/dashboard');
      }

      // Check for "Application error" crash
      if (body.includes('Application error') || body.includes('ChunkLoadError')) {
        addError('uncaughtException', `App crash on ${ctx.page}: ${body.slice(0, 150)}`, ctx.page);
        R.brokenFlows.push({ user: ctx.user.email, page: ctx.page, error: 'Application error rendered' });
      }
    } catch (_) {}
  },

  // 15. Click table row or list item
  async (page, ctx) => {
    try {
      const rows = await page.$$('tbody tr:visible, [role="row"]:visible');
      if (rows.length > 1) {
        await pick(rows.slice(1)).click({ timeout: 2000 }).catch(() => {});
        await sleep(rand(200, 500));
      }
    } catch (_) {}
  },

  // 16. Logout mid-session (5% chance) then re-login
  async (page, ctx) => {
    if (Math.random() > 0.95) {
      try {
        // Try user menu → logout
        const userBtns = await page.$$('[aria-label*="user" i], [aria-label*="account" i], .avatar, [data-testid*="user"]');
        if (userBtns.length) {
          await pick(userBtns).click({ timeout: 3000 }).catch(() => {});
          await sleep(rand(300, 600));
          const logoutBtn = await page.$('button:has-text("Logout"), button:has-text("Sign out"), a:has-text("Logout")');
          if (logoutBtn) {
            await logoutBtn.click({ timeout: 4000 });
            await page.waitForURL(u => u.href.includes('/login'), { timeout: 12000 });
            R.brokenFlows.push({ type: 'mid-session-logout', user: ctx.user.email });
            // Re-login
            const ok = await doLogin(page, ctx.user, ctx.sid);
            if (!ok) R.brokenFlows.push({ type: 'relogin-failed', user: ctx.user.email });
          }
        }
      } catch (_) {}
    }
  },

  // 17. Refresh mid-request
  async (page, ctx) => {
    const target = pick(APP_PAGES);
    try {
      const gp = page.goto(`${BASE}${target}`, { timeout: 8000 }).catch(() => {});
      await sleep(rand(80, 350));
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 12000 });
      ctx.page = target;
      await gp.catch(() => {});
    } catch (e) { addError('navigationFailure', `refresh-mid-req: ${e.message.slice(0,80)}`, target); }
  },

  // 18. UI freeze probe
  async (page, ctx) => {
    try {
      const t0 = Date.now();
      await page.evaluate(() => Date.now(), { timeout: 3500 });
      const ms = Date.now() - t0;
      if (ms > 2500) addError('uiFreeze', `JS froze ${ms}ms on ${ctx.page}`, ctx.page);
    } catch (e) {
      addError('uiFreeze', `evaluate timeout on ${ctx.page}`, ctx.page);
    }
  },

  // 19. Tab key spam + Enter
  async (page, ctx) => {
    try {
      for (let i = 0; i < rand(4, 10); i++) {
        await page.keyboard.press('Tab').catch(() => {});
        await sleep(rand(20, 60));
      }
      await page.keyboard.press('Enter').catch(() => {});
    } catch (_) {}
  },

  // 20. Scroll to bottom + back to top
  async (page, ctx) => {
    try {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await sleep(200);
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    } catch (_) {}
  },

  // 21. Select dropdown option
  async (page, ctx) => {
    try {
      const sels = await page.$$('select:visible');
      if (sels.length) {
        const sel = pick(sels);
        const opts = await sel.$$('option');
        if (opts.length > 1) {
          const v = await pick(opts).getAttribute('value').catch(() => null);
          if (v) await sel.selectOption(v, { timeout: 2000 }).catch(() => {});
        }
      }
    } catch (_) {}
  },

  // 22. Search/filter input interaction
  async (page, ctx) => {
    try {
      const searchInputs = await page.$$('input[placeholder*="Search" i]:visible, input[placeholder*="Filter" i]:visible, input[type="search"]:visible');
      if (searchInputs.length) {
        const inp = pick(searchInputs);
        await inp.fill('', { timeout: 2000 }).catch(() => {});
        await sleep(200);
        await inp.fill(pick(['test', '!!@@##', '<script>', 'a'.repeat(200), '']), { timeout: 2000 }).catch(() => {});
        await sleep(rand(300, 600));
      }
    } catch (_) {}
  },
];

// ── Single session runner ─────────────────────────────────────────────────────
async function runSession(browser, sid) {
  const user = pick(USERS);
  const ctx  = { user, page: '/login', sid };
  R.sessionsTotal++;

  const bCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const pw = await bCtx.newPage();
  let consoleErrorCount = 0;

  pw.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrorCount++;
      addError('consoleError', `[S${sid}] ${msg.text().slice(0, 150)}`, ctx.page);
    }
  });
  pw.on('pageerror', err => {
    addError('uncaughtException', `[S${sid}] ${err.message.slice(0, 150)}`, ctx.page);
  });

  try {
    log(sid, `→ ${user.email} (${user.role})`);
    const ok = await doLogin(pw, user, sid);
    if (!ok) {
      R.sessionsFailed++;
      await bCtx.close().catch(() => {});
      return;
    }

    const actionCount = rand(MIN_ACTIONS, MAX_ACTIONS);
    log(sid, `running ${actionCount} actions`);

    for (let i = 0; i < actionCount; i++) {
      await sleep(rand(0, 1800)); // 0–1.8s jitter between actions
      const action = pick(ACTIONS);
      try {
        await Promise.race([
          action(pw, ctx),
          new Promise((_, rej) => setTimeout(() => rej(new Error('action-timeout')), 10000)),
        ]);
      } catch (e) {
        if (e.message === 'action-timeout') {
          addError('pageTimeout', `S${sid} action ${i} timed out on ${ctx.page}`, ctx.page);
        }
      }
      R.totalActions++;
    }

    R.sessionsSucceeded++;
    log(sid, `✓ done — ${actionCount} actions | console errors: ${consoleErrorCount}`);
  } catch (e) {
    R.sessionsFailed++;
    addError('navigationFailure', `S${sid} fatal: ${e.message.slice(0, 150)}`);
    log(sid, `✗ fatal — ${e.message.slice(0, 80)}`);
  } finally {
    await bCtx.close().catch(() => {});
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'═'.repeat(62)}`);
  console.log('  NexusOps · Playwright Chaos Test — Round 3 (v2)');
  console.log(`  Target : ${BASE}`);
  console.log(`  Sessions: ${SESSIONS}  ·  Actions/session: ${MIN_ACTIONS}–${MAX_ACTIONS}`);
  console.log(`  Batches : ${Math.ceil(SESSIONS/BATCH_SIZE)} × ${BATCH_SIZE} parallel`);
  console.log(`${'═'.repeat(62)}\n`);

  const t0 = Date.now();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    for (let b = 0; b < SESSIONS; b += BATCH_SIZE) {
      const end  = Math.min(b + BATCH_SIZE, SESSIONS);
      const bNum = Math.floor(b / BATCH_SIZE) + 1;
      console.log(`\n▶ Batch ${bNum} — sessions ${b+1}–${end}`);
      const batch = [];
      for (let i = b; i < end; i++) batch.push(runSession(browser, i + 1));
      await Promise.all(batch);
      console.log(`  ✓ Batch ${bNum} complete`);
    }
  } finally {
    await browser.close();
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ── Report ────────────────────────────────────────────────────────────────
  const topPages = Object.entries(R.pageFailures)
    .sort(([,a],[,b]) => b - a).slice(0, 8);

  const report = {
    meta: { date: new Date().toISOString(), target: BASE, durationSec: +elapsed, sessions: SESSIONS },
    '1_totalSessionsExecuted':  R.sessionsTotal,
    '2_totalErrors':            R.totalErrors,
    '3_errorCategories':        R.categories,
    '4_pagesWithMostFailures':  Object.fromEntries(topPages),
    '5_brokenFlows':            R.brokenFlows.length ? R.brokenFlows.slice(0, 20) : 'None detected',
    '6_rbacViolations':         R.rbacViolations.length ? R.rbacViolations : 'None detected — RBAC appears correct',
    '7_dataInconsistencies':    'No DB-level inconsistencies detectable from Playwright (see API stress logs)',
    summary: {
      sessionsSucceeded: R.sessionsSucceeded,
      sessionsFailed:    R.sessionsFailed,
      loginFailures:     R.loginFailures,
      totalActions:      R.totalActions,
      totalErrors:       R.totalErrors,
    },
    verdict: R.sessionsFailed === 0 && R.rbacViolations.length === 0
      ? '✅ PASS'
      : R.rbacViolations.length > 0
        ? '🔴 FAIL — RBAC violations detected'
        : R.sessionsFailed <= SESSIONS * 0.15
          ? '⚠️  MOSTLY PASS — minor session failures'
          : '🔴 FAIL — high session failure rate',
    rawErrorSample: R.rawErrors.filter(e => e.cat !== 'duplicateAction').slice(0, 40),
  };

  console.log(`\n${'═'.repeat(62)}`);
  console.log('  CHAOS TEST RESULTS');
  console.log(`${'═'.repeat(62)}`);
  console.log(`  Duration          : ${elapsed}s`);
  console.log(`  Sessions executed : ${R.sessionsTotal}`);
  console.log(`  ✓ Succeeded       : ${R.sessionsSucceeded}`);
  console.log(`  ✗ Failed          : ${R.sessionsFailed}`);
  console.log(`  Login failures    : ${R.loginFailures}`);
  console.log(`  Total actions     : ${R.totalActions}`);
  console.log(`  Total errors      : ${R.totalErrors}`);
  console.log('');
  console.log('  Error Categories:');
  for (const [k,v] of Object.entries(R.categories)) {
    if (v > 0) console.log(`    ${k.padEnd(30)} ${v}`);
  }
  console.log('');
  console.log('  Pages with Most Failures:');
  if (topPages.length) topPages.forEach(([p,n]) => console.log(`    ${p.padEnd(38)} ${n}`));
  else console.log('    None');
  console.log('');
  console.log('  RBAC Violations:');
  if (R.rbacViolations.length) R.rbacViolations.forEach(v => console.log(`    ⚠  ${v.user} @ ${v.url}: ${v.leak}`));
  else console.log('    None detected');
  console.log('');
  console.log('  Broken Flows:');
  if (Array.isArray(R.brokenFlows) && R.brokenFlows.length) R.brokenFlows.slice(0,8).forEach(f => console.log(`    • ${JSON.stringify(f)}`));
  else console.log('    None');
  console.log('');
  console.log(`  Verdict : ${report.verdict}`);
  console.log(`${'═'.repeat(62)}\n`);

  const outPath = new URL('./results/playwright-chaos-round3.json', import.meta.url).pathname;
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`  Report saved: ${outPath}\n`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });

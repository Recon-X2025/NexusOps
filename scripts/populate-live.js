#!/usr/bin/env node
/**
 * NexusOps — Live Server Data Population Script
 * Populates the Vultr server with realistic data across all modules.
 *
 * Usage:
 *   BASE_URL=http://139.84.154.78:3001 node scripts/populate-live.js
 */
"use strict";

const BASE = (process.env.BASE_URL ?? "http://139.84.154.78:3001") + "/trpc";

const PERSONAS = [
  { role: "admin",   email: "admin@coheron.com",    password: "demo1234!" },
  { role: "agent1",  email: "agent1@coheron.com",   password: "demo1234!" },
  { role: "agent2",  email: "agent2@coheron.com",   password: "demo1234!" },
  { role: "hr",      email: "hr@coheron.com",        password: "demo1234!" },
  { role: "finance", email: "finance@coheron.com",  password: "demo1234!" },
  { role: "emp",     email: "employee@coheron.com", password: "demo1234!" },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function post(path, body, token) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function login(email, password) {
  const r = await post("auth.login", { email, password });
  return r?.result?.data?.sessionId ?? null;
}

// ── Data helpers ──────────────────────────────────────────────────────────────

const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const TICKET_TITLES = [
  "Production database failing health checks",
  "VPN disconnects every 30 minutes for remote users",
  "Email server queue backed up — 2,000+ messages delayed",
  "SSL certificate expiring in 3 days on payments gateway",
  "Kubernetes pod crashlooping in production namespace",
  "Active Directory sync failing — users locked out",
  "AWS S3 bucket policy misconfiguration detected",
  "CI/CD pipeline broken after last deployment",
  "Network switch offline — Building C floor 3",
  "SAP performance degradation during payroll run",
  "New hire laptop setup — Sarah Johnson starts Monday",
  "Software license renewal — Adobe Creative Cloud 50 seats",
  "MFA not working for finance team after migration",
  "Backup job failing silently for 3 days",
  "Load balancer health checks failing intermittently",
  "DNS resolution failure affecting external services",
  "Security incident — suspicious login from unknown IP",
  "Patch deployment failed on 12 production servers",
  "Power outage caused unclean shutdown — data check needed",
  "API rate limiting too aggressive — blocking integrations",
  "Printer offline — HR Department 2nd floor",
  "SharePoint permissions audit request",
  "On-call escalation — P1 incident no response after 15min",
  "Zero-day vulnerability in OpenSSL — urgent patching needed",
  "Database deadlock causing order processing failures",
  "Cloud cost spike — $45k over budget this month",
  "GDPR data deletion request — customer John Doe",
  "Firewall rule blocking legitimate traffic to API",
  "Monitoring alert — disk usage at 94% on db-prod-01",
  "Service account password expiry causing app failures",
];

const CHANGE_TITLES = [
  "Deploy v2.4.1 hotfix to production — payments module",
  "Migrate database from PostgreSQL 14 to 16",
  "Update firewall rules — allow new vendor IP ranges",
  "Upgrade Kubernetes cluster from 1.27 to 1.29",
  "Rotate all production API keys and secrets",
  "Enable WAF rules on CloudFront distribution",
  "Add read replica for reporting database",
  "Decommission legacy LDAP server",
  "Implement new backup retention policy",
  "Upgrade Redis from 6.x to 7.x in production",
  "Enable TLS 1.3 — disable TLS 1.0/1.1",
  "Deploy new monitoring stack — Prometheus + Grafana",
  "Migrate CI/CD from Jenkins to GitHub Actions",
  "Enable multi-region failover for API gateway",
  "Add DDoS protection to public endpoints",
];

const WO_DESCRIPTIONS = [
  "Replace UPS battery — Server Room A",
  "Install network switch — Floor 4",
  "Deploy workstations — new hire batch Q2",
  "Cable management — Data centre row 3",
  "Printer maintenance — all floors quarterly service",
  "Replace failed hard drive — storage array node 2",
  "HVAC inspection — server room — quarterly",
  "Install access control panel — main entrance",
  "Emergency generator test — quarterly compliance check",
  "Network audit — all switch ports",
  "Decommission end-of-life servers — rack 7",
  "Physical security walkthrough — all data centres",
  "Structured cabling — new wing office fit-out",
  "Install KVM console — secondary data centre",
  "Rack and stack — new compute nodes",
];

const KB_TITLES = [
  "How to reset your VPN credentials",
  "Troubleshooting slow network performance",
  "Software installation guide — approved tools list",
  "Password policy and self-service reset procedures",
  "Remote working setup checklist",
  "How to request new hardware or software",
  "IT Security best practices for remote workers",
  "Backup and recovery procedures for critical data",
  "On-call rotation and escalation guide",
  "Service desk SLA definitions and priority matrix",
  "How to raise a P1 major incident",
  "Certificate renewal runbook — internal PKI",
  "Approved cloud services list and access request process",
  "Patch management schedule and maintenance windows",
  "GDPR data subject access request procedure",
];

const TICKET_TYPES = ["incident", "request", "problem", "incident", "incident", "request"];
const PRIORITIES   = ["p1", "p2", "p3", "p4", "p2", "p3"];
const CHANGE_TYPES = ["normal", "standard", "emergency", "normal", "normal"];
const CHANGE_RISK  = ["low", "medium", "high", "medium", "low"];
const WO_PRIORITIES = ["1_critical", "2_high", "3_moderate", "4_low", "5_planning"];
const WO_TYPES      = ["corrective", "preventive", "installation", "inspection"];
const WO_LOCATIONS  = ["Data Centre A", "Data Centre B", "Floor 1", "Floor 2", "Floor 3", "Remote"];

let totalCreated = 0;
const errors = [];

// ── Module creators ───────────────────────────────────────────────────────────

async function createTickets(token, count) {
  let created = 0;
  for (let i = 0; i < count; i++) {
    try {
      const r = await post("tickets.create", {
        type: rand(TICKET_TYPES),
        title: rand(TICKET_TITLES),
        description: `Steps to reproduce:\n1. Observe the issue.\n2. Confirm with affected users.\n3. Check system logs.\n\nBusiness impact: ${rand(["High — revenue impacted", "Medium — workaround available", "Low — cosmetic issue only"])}. Auto-populated for testing.`,
        priority: rand(PRIORITIES),
      }, token);
      if (r?.result?.data) created++;
      else if (r?.error) errors.push(`ticket: ${r.error.message?.slice(0, 100)}`);
      await sleep(50);
    } catch (e) { errors.push(`ticket: ${e.message}`); }
  }
  return created;
}

async function createChangeRequests(token, count) {
  let created = 0;
  for (let i = 0; i < count; i++) {
    try {
      const startOffset = randInt(1, 30);
      const r = await post("changes.create", {
        title: rand(CHANGE_TITLES),
        description: "Full impact assessment, rollback plan, and test results attached. Auto-populated for testing.",
        changeType: rand(CHANGE_TYPES),
        riskLevel: rand(CHANGE_RISK),
        scheduledStart: new Date(Date.now() + startOffset * 86400000).toISOString(),
        scheduledEnd: new Date(Date.now() + (startOffset + randInt(1, 14)) * 86400000).toISOString(),
      }, token);
      if (r?.result?.data) created++;
      else if (r?.error) errors.push(`change: ${r.error.message?.slice(0, 100)}`);
      await sleep(60);
    } catch (e) { errors.push(`change: ${e.message}`); }
  }
  return created;
}

async function createWorkOrders(token, count) {
  let created = 0;
  for (let i = 0; i < count; i++) {
    try {
      const r = await post("workOrders.create", {
        shortDescription: rand(WO_DESCRIPTIONS),
        description: "Work order details, materials required, and completion criteria documented. Auto-populated for testing.",
        priority: rand(WO_PRIORITIES),
        type: rand(WO_TYPES),
        location: rand(WO_LOCATIONS),
        estimatedHours: randInt(1, 16),
      }, token);
      if (r?.result?.data) created++;
      else if (r?.error) errors.push(`work_order: ${r.error.message?.slice(0, 100)}`);
      await sleep(60);
    } catch (e) { errors.push(`work_order: ${e.message}`); }
  }
  return created;
}

async function createKBArticles(token, count) {
  let created = 0;
  for (let i = 0; i < count; i++) {
    try {
      const r = await post("knowledge.create", {
        title: rand(KB_TITLES),
        content: `## Overview\n\nThis article covers the procedure in detail.\n\n## Steps\n\n1. Open the relevant portal.\n2. Follow the on-screen instructions.\n3. Contact the service desk if you need assistance.\n\n## Related Articles\n\n- See also: IT Security Policy\n- See also: Acceptable Use Policy\n\nAuto-populated for testing.`,
        category: rand(["how-to", "troubleshooting", "policy", "reference"]),
      }, token);
      if (r?.result?.data) created++;
      else if (r?.error) errors.push(`kb: ${r.error.message?.slice(0, 100)}`);
      await sleep(80);
    } catch (e) { errors.push(`kb: ${e.message}`); }
  }
  return created;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     NexusOps Live Data Population                       ║");
  console.log(`║     Target: ${BASE.replace("/trpc", "").padEnd(44)}║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log("► Logging in all personas...");
  const tokens = {};
  for (const p of PERSONAS) {
    const token = await login(p.email, p.password);
    if (token) {
      tokens[p.role] = token;
      console.log(`  ✓ ${p.role.padEnd(8)} ${p.email}`);
    } else {
      console.log(`  ✗ ${p.role.padEnd(8)} ${p.email} — LOGIN FAILED`);
    }
    await sleep(150);
  }

  const adminToken  = tokens.admin;
  const agent1Token = tokens.agent1  ?? adminToken;
  const agent2Token = tokens.agent2  ?? adminToken;

  if (!adminToken) {
    console.error("\n✗ Admin login failed — cannot proceed.");
    process.exit(1);
  }

  console.log("\n► Populating data...\n");

  // Tickets — 150 records across types/priorities/users
  process.stdout.write("  Tickets         (150) ... ");
  let n  = await createTickets(adminToken, 50);
      n += await createTickets(agent1Token, 50);
      n += await createTickets(agent2Token, 50);
  totalCreated += n;
  console.log(`${n} created`);

  // Change requests — 40 records
  process.stdout.write("  Change Requests  (40) ... ");
  n  = await createChangeRequests(adminToken, 25);
  n += await createChangeRequests(agent1Token, 15);
  totalCreated += n;
  console.log(`${n} created`);

  // Work orders — 30 records
  process.stdout.write("  Work Orders      (30) ... ");
  n  = await createWorkOrders(adminToken, 20);
  n += await createWorkOrders(agent1Token, 10);
  totalCreated += n;
  console.log(`${n} created`);

  // Knowledge base articles — 20 records
  process.stdout.write("  KB Articles      (20) ... ");
  n = await createKBArticles(adminToken, 20);
  totalCreated += n;
  console.log(`${n} created`);

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  TOTAL RECORDS CREATED : ${String(totalCreated).padEnd(32)}║`);
  console.log(`║  ERRORS                : ${String(errors.length).padEnd(32)}║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);

  if (errors.length > 0) {
    console.log("\nFirst 15 errors:");
    errors.slice(0, 15).forEach(e => console.log("  •", e));
  }
}

main().catch(console.error);

/**
 * Test fixtures — reusable data objects for all test layers.
 * All fixtures use org_id: PLACEHOLDER_ORG_ID — replace before inserting.
 */

export const PLACEHOLDER_ORG_ID = "00000000-0000-0000-0000-000000000000";

// ── Ticket Fixtures ──────────────────────────────────────────────────────

export const TICKET_FIXTURES = [
  { title: "Production server down", type: "incident" as const, description: "Main API server not responding" },
  { title: "Cannot access VPN", type: "incident" as const, description: "VPN connection timeout" },
  { title: "Request new laptop", type: "request" as const, description: "MacBook Pro for new hire" },
  { title: "Email not syncing", type: "incident" as const, description: "Exchange sync failing since 9am" },
  { title: "Software license needed", type: "request" as const, description: "Adobe Creative Suite" },
  { title: "Printer offline", type: "incident" as const, description: "Floor 3 printer not reachable" },
  { title: "Password reset request", type: "request" as const, description: "User locked out" },
  { title: "Database slow queries", type: "problem" as const, description: "Recurring slowness traced to query plan" },
  { title: "Network intermittent", type: "problem" as const, description: "Packet loss on west wing" },
  { title: "Deploy hotfix", type: "change" as const, description: "Security patch for CVE-2024-1234" },
  { title: "Memory leak in API", type: "incident" as const, description: "API OOM after 6h uptime" },
  { title: "Office 365 login broken", type: "incident" as const, description: "SSO redirect loop" },
  { title: "New user onboarding", type: "request" as const, description: "Provision accounts for Jane Doe" },
  { title: "Firewall rule change", type: "change" as const, description: "Allow port 8443 from DMZ" },
  { title: "SSL cert expiry", type: "incident" as const, description: "Cert expires in 3 days" },
  { title: "Backup restore needed", type: "request" as const, description: "Recover deleted files from NAS" },
  { title: "Performance degradation", type: "problem" as const, description: "Root cause of recurring slowness" },
  { title: "Security patch rollout", type: "change" as const, description: "OS patches for 200 machines" },
  { title: "Mobile MDM enrollment", type: "request" as const, description: "Enroll new iPhones in MDM" },
  { title: "Critical data breach suspected", type: "incident" as const, description: "Anomalous outbound traffic detected" },
];

// ── Change Fixtures ──────────────────────────────────────────────────────

export const CHANGE_FIXTURES = [
  { title: "Upgrade PostgreSQL to 16", type: "normal" as const, risk: "medium" as const, description: "DB version upgrade" },
  { title: "Emergency patch CVE-2024-5678", type: "emergency" as const, risk: "high" as const, description: "Critical security fix" },
  { title: "Add Redis cluster", type: "normal" as const, risk: "low" as const, description: "HA Redis setup" },
  { title: "Migrate S3 buckets", type: "normal" as const, risk: "medium" as const, description: "Cross-region replication" },
  { title: "Standard weekly deploy", type: "standard" as const, risk: "low" as const, description: "Routine release" },
  { title: "Load balancer config update", type: "normal" as const, risk: "medium" as const, description: "Health check intervals" },
  { title: "API rate limiting rollout", type: "normal" as const, risk: "low" as const, description: "Protect endpoints" },
  { title: "Kubernetes upgrade 1.29", type: "normal" as const, risk: "high" as const, description: "Major k8s version" },
  { title: "DNS cutover", type: "normal" as const, risk: "high" as const, description: "Production DNS migration" },
  { title: "Feature flag deploy", type: "standard" as const, risk: "low" as const, description: "Incremental rollout" },
];

// ── HR Case Fixtures ─────────────────────────────────────────────────────

export const HR_CASE_FIXTURES = [
  { title: "Onboarding - Jane Doe", type: "onboarding" as const, description: "New hire start Jan 1" },
  { title: "Offboarding - John Smith", type: "offboarding" as const, description: "Last day Jan 31" },
  { title: "Harassment complaint", type: "complaint" as const, description: "Employee A vs Employee B" },
  { title: "Performance improvement plan", type: "performance" as const, description: "Q4 PIP for agent" },
  { title: "Medical leave request", type: "leave" as const, description: "FMLA application" },
  { title: "Salary correction", type: "payroll" as const, description: "Incorrect pay Feb" },
  { title: "Role change - promoton", type: "general" as const, description: "IC to Manager" },
  { title: "Benefits enrollment", type: "benefits" as const, description: "Annual enrollment" },
  { title: "Disciplinary action", type: "disciplinary" as const, description: "Policy violation" },
  { title: "Relocation support", type: "general" as const, description: "Mumbai to Bangalore transfer" },
];

// ── CRM Fixtures ─────────────────────────────────────────────────────────

export const CRM_FIXTURES = {
  accounts: [
    { name: "Acme Corp", industry: "Technology", website: "https://acme.com" },
    { name: "Globex Inc", industry: "Manufacturing", website: "https://globex.com" },
    { name: "Initech LLC", industry: "Finance", website: "https://initech.com" },
    { name: "Umbrella Corp", industry: "Pharma", website: "https://umbrella.com" },
    { name: "Hooli Inc", industry: "Technology", website: "https://hooli.com" },
  ],
  contacts: [
    { name: "Alice Johnson", email: "alice@acme.com", title: "CTO" },
    { name: "Bob Martinez", email: "bob@globex.com", title: "VP Procurement" },
    { name: "Carol White", email: "carol@initech.com", title: "CFO" },
    { name: "Dave Brown", email: "dave@umbrella.com", title: "Director IT" },
    { name: "Eve Davis", email: "eve@hooli.com", title: "CEO" },
    { name: "Frank Wilson", email: "frank@acme.com", title: "Head of Engineering" },
    { name: "Grace Lee", email: "grace@globex.com", title: "Procurement Manager" },
    { name: "Henry Kim", email: "henry@initech.com", title: "IT Manager" },
    { name: "Iris Chen", email: "iris@umbrella.com", title: "Operations Lead" },
    { name: "Jack Turner", email: "jack@hooli.com", title: "COO" },
  ],
  deals: [
    { name: "Acme ERP Deal", stage: "proposal" as const, amount: 500000 },
    { name: "Globex Platform", stage: "qualification" as const, amount: 250000 },
    { name: "Initech Migration", stage: "closed_won" as const, amount: 150000 },
    { name: "Umbrella Security", stage: "negotiation" as const, amount: 750000 },
    { name: "Hooli AI Suite", stage: "discovery" as const, amount: 1000000 },
    { name: "Acme Support", stage: "closed_lost" as const, amount: 50000 },
    { name: "Globex Analytics", stage: "proposal" as const, amount: 300000 },
    { name: "Initech ITSM", stage: "closed_won" as const, amount: 200000 },
  ],
};

// ── Procurement Fixtures ─────────────────────────────────────────────────

export const PROCUREMENT_FIXTURES = {
  prs: [
    { title: "Office supplies Q1", description: "Pens, paper, staples", amount: 50000 },      // < 75k → auto-approve
    { title: "Dev laptops batch", description: "10 MacBook Pros", amount: 300000 },           // 75k–750k → dept head
    { title: "Cloud contract renewal", description: "AWS annual commitment", amount: 1000000 }, // > 750k → VP + finance
    { title: "Ergonomic chairs", description: "25 chairs for new office", amount: 62500 },    // < 75k → auto-approve
    { title: "Enterprise software", description: "Salesforce annual", amount: 850000 },       // > 750k → VP + finance
  ],
  vendors: [
    { name: "TechSupply Co", code: "VND-001", email: "billing@techsupply.com", category: "hardware" },
    { name: "CloudServ Ltd", code: "VND-002", email: "billing@cloudserv.com", category: "software" },
    { name: "OfficeMart", code: "VND-003", email: "billing@officemart.com", category: "facilities" },
    { name: "SecureNet", code: "VND-004", email: "billing@securenet.com", category: "security" },
    { name: "DataBackup Inc", code: "VND-005", email: "billing@databackup.com", category: "services" },
  ],
};

// ── Asset Fixtures ───────────────────────────────────────────────────────

export const ASSET_FIXTURES = {
  hardware: [
    { name: "MacBook Pro M3 #001", serialNumber: "C02XA1BFHTD6", status: "in_use" as const },
    { name: "MacBook Pro M3 #002", serialNumber: "C02XA1BFHTD7", status: "in_use" as const },
    { name: "Dell XPS 15 #001", serialNumber: "DXPS-2024-001", status: "available" as const },
    { name: "iPhone 15 Pro #001", serialNumber: "F7TBM1234567", status: "in_use" as const },
    { name: "iPad Pro 12.9 #001", serialNumber: "DMQR1234567A", status: "available" as const },
    { name: "Cisco Router #001", serialNumber: "FHH1234A0BC", status: "in_use" as const },
    { name: "HP Laser Printer #001", serialNumber: "CNBKH12345", status: "in_use" as const },
    { name: "Monitor LG 27\" #001", serialNumber: "LG27MK2024-001", status: "available" as const },
    { name: "MacBook Air M2 #001", serialNumber: "C02XA1BFHTD8", status: "retired" as const },
    { name: "Surface Pro 9 #001", serialNumber: "SP9-2024-0001", status: "in_repair" as const },
  ],
};

// ── Contract Fixtures ────────────────────────────────────────────────────

export const CONTRACT_FIXTURES = [
  { title: "AWS Enterprise Agreement", counterparty: "Amazon Web Services", type: "vendor" as const, status: "active" as const, value: 2000000 },
  { title: "Microsoft ELA", counterparty: "Microsoft Corporation", type: "vendor" as const, status: "draft" as const, value: 500000 },
  { title: "Office Lease Mumbai", counterparty: "DLF Properties", type: "lease" as const, status: "active" as const, value: 3600000 },
  { title: "Salesforce CRM", counterparty: "Salesforce Inc", type: "vendor" as const, status: "expiring_soon" as const, value: 250000 },
  { title: "NDА - Acme Corp", counterparty: "Acme Corporation", type: "nda" as const, status: "active" as const, value: 0 },
];

// ── Security Fixtures ────────────────────────────────────────────────────

export const SECURITY_FIXTURES = {
  incidents: [
    { title: "Brute force on admin portal", severity: "high" as const, status: "new" as const },
    { title: "Phishing campaign targeting HR", severity: "medium" as const, status: "triage" as const },
    { title: "Unusual outbound traffic", severity: "critical" as const, status: "containment" as const },
    { title: "Compromised service account", severity: "high" as const, status: "eradication" as const },
    { title: "Ransomware false positive", severity: "low" as const, status: "closed" as const },
  ],
  vulnerabilities: [
    { title: "CVE-2024-1234 - Log4Shell variant", severity: "critical" as const, status: "open" as const, cvssScore: "9.8" },
    { title: "CVE-2024-5678 - OpenSSL buffer overflow", severity: "high" as const, status: "in_progress" as const, cvssScore: "8.1" },
    { title: "CVE-2024-9012 - Spring4Shell", severity: "high" as const, status: "remediated" as const, cvssScore: "8.5" },
    { title: "CVE-2024-3456 - Jenkins RCE", severity: "critical" as const, status: "open" as const, cvssScore: "9.9" },
    { title: "CVE-2024-7890 - Struts2 RCE", severity: "high" as const, status: "accepted" as const, cvssScore: "7.5" },
    { title: "CVE-2024-2345 - Apache HTTP SSRF", severity: "medium" as const, status: "open" as const, cvssScore: "6.5" },
    { title: "CVE-2024-6789 - Weak TLS config", severity: "low" as const, status: "false_positive" as const, cvssScore: "3.7" },
    { title: "CVE-2024-0123 - npm package dep", severity: "medium" as const, status: "open" as const, cvssScore: "5.9" },
  ],
};

// ── GRC Fixtures ─────────────────────────────────────────────────────────

export const GRC_FIXTURES = {
  risks: [
    { title: "Vendor concentration risk", category: "operational" as const, likelihood: 3, impact: 4 },
    { title: "Data breach - customer PII", category: "information" as const, likelihood: 2, impact: 5 },
    { title: "Key person dependency", category: "operational" as const, likelihood: 4, impact: 3 },
    { title: "Regulatory non-compliance GDPR", category: "compliance" as const, likelihood: 2, impact: 5 },
    { title: "Ransomware attack", category: "information" as const, likelihood: 3, impact: 5 },
  ],
  policies: [
    { title: "Information Security Policy", category: "security" as const, status: "published" as const },
    { title: "Acceptable Use Policy", category: "compliance" as const, status: "published" as const },
    { title: "Data Retention Policy", category: "data" as const, status: "draft" as const },
  ],
};

// ── Financial Fixtures ───────────────────────────────────────────────────

export const FINANCIAL_FIXTURES = {
  budgetLines: [
    { name: "IT Infrastructure Q1", department: "IT", amount: 500000, spent: 125000 },
    { name: "Software Licenses FY24", department: "IT", amount: 200000, spent: 180000 },
    { name: "Cloud Services Q1", department: "Engineering", amount: 300000, spent: 95000 },
    { name: "HR Training Budget FY24", department: "HR", amount: 100000, spent: 45000 },
    { name: "Marketing Campaigns Q1", department: "Marketing", amount: 750000, spent: 310000 },
    { name: "Office Operations FY24", department: "Facilities", amount: 400000, spent: 200000 },
    { name: "Security Tools FY24", department: "Security", amount: 150000, spent: 70000 },
    { name: "R&D Lab Equipment", department: "Engineering", amount: 600000, spent: 0 },
    { name: "Sales Enablement Q1", department: "Sales", amount: 250000, spent: 100000 },
    { name: "Legal Retainer FY24", department: "Legal", amount: 200000, spent: 150000 },
  ],
};

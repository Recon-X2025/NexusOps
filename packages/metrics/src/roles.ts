import type { RoleView } from "./types";

export const ROLE_VIEWS: RoleView[] = [
  {
    key: "ceo",
    label: "Chief executive",
    rbacRoles: ["admin", "founder", "cxo:ceo"],
    scopedFunctions: ["it_services", "security", "people", "customer", "finance", "legal", "strategy", "devops"],
    narrativeTemplate:
      "Overall posture reflects how well IT, security, people, revenue, and finance signals align for the period.",
    attentionRules: [
      { metricId: "csm.csat_avg", when: "state_is_watch", severity: "watch" },
      { metricId: "csm.churn_rate_30d", when: "state_is_stressed", severity: "high" },
      { metricId: "financial.ar_aged_60_plus", when: "breached_target", severity: "high" },
      { metricId: "approvals.stuck_over_5d", when: "state_is_watch", severity: "watch" },
    ],
  },
  {
    key: "coo",
    label: "Chief operating officer",
    rbacRoles: ["cxo:coo", "ops_lead", "it_manager", "manager_ops"],
    scopedFunctions: ["it_services", "people", "customer", "finance", "strategy", "devops", "security", "legal"],
    narrativeTemplate:
      "Operations posture spans service throughput, workforce signals, customer delivery, and financial run-rate.",
    attentionRules: [
      { metricId: "tickets.open_total", when: "state_is_watch", severity: "watch" },
      { metricId: "approvals.stuck_over_5d", when: "state_is_stressed", severity: "high" },
    ],
  },
  {
    key: "cio",
    label: "Chief information officer",
    rbacRoles: ["cxo:cio", "cxo:cto", "eng_lead", "it_admin", "itil_admin", "itil_manager"],
    scopedFunctions: ["it_services", "devops", "security", "strategy", "people", "customer", "finance", "legal"],
    narrativeTemplate:
      "Technology posture emphasizes reliability, change throughput, security exposure, and engineering delivery.",
    attentionRules: [
      { metricId: "tickets.sla_compliance", when: "state_is_watch", severity: "watch" },
      { metricId: "devops.deploy_success_rate", when: "state_is_stressed", severity: "high" },
      { metricId: "security.critical_open", when: "state_is_stressed", severity: "high" },
    ],
  },
  {
    key: "cfo",
    label: "Chief financial officer",
    rbacRoles: ["cfo", "finance_manager"],
    scopedFunctions: ["finance", "strategy", "customer", "it_services", "people", "legal", "security", "devops"],
    narrativeTemplate: "Financial posture highlights cash, margin, collections, and operational cost drivers.",
    attentionRules: [],
  },
  {
    key: "chro",
    label: "Chief human resources officer",
    rbacRoles: ["chro", "hr_manager"],
    scopedFunctions: ["people", "strategy", "finance", "it_services", "customer", "legal", "security", "devops"],
    narrativeTemplate: "People posture focuses on headcount, hiring velocity, retention risk, and workforce health.",
    attentionRules: [],
  },
  {
    key: "ciso",
    label: "Chief information security officer",
    rbacRoles: ["ciso", "security_analyst"],
    scopedFunctions: ["security", "it_services", "devops", "strategy", "people", "customer", "finance", "legal"],
    narrativeTemplate: "Security posture summarizes incident load, critical exposure, and remediation tempo.",
    attentionRules: [],
  },
  {
    key: "cs",
    label: "Company secretary",
    rbacRoles: ["company_secretary"],
    scopedFunctions: ["legal", "strategy", "finance", "it_services", "people", "customer", "security", "devops"],
    narrativeTemplate: "Governance posture tracks compliance cadence, board-critical items, and statutory risk.",
    attentionRules: [],
  },
  {
    key: "gc",
    label: "General counsel",
    rbacRoles: ["legal_counsel", "general_counsel"],
    scopedFunctions: ["legal", "strategy", "finance", "customer", "it_services", "people", "security", "devops"],
    narrativeTemplate: "Legal posture highlights contractual, regulatory, and litigation-facing exposure.",
    attentionRules: [],
  },
];

/**
 * Standard contract clause templates (starting points only — not legal advice).
 */

export type ClauseField = {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "textarea" | "currency";
  defaultValue: string | number;
  options?: string[];
  placeholder?: string;
  helperText?: string;
};

export type Clause = {
  id: string;
  title: string;
  description: string;
  body: string;
  isRequired: boolean;
  isEnabled: boolean;
  fields: ClauseField[];
  category: "core" | "commercial" | "legal" | "operational";
};

export type ContractTemplate = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  clauses: Clause[];
};

/** Wizard/runtime state for a single clause */
export type WizardClauseState = {
  id: string;
  title: string;
  description: string;
  bodyTemplate: string;
  isRequired: boolean;
  isEnabled: boolean;
  category: Clause["category"];
  fields: ClauseField[];
  fieldValues: Record<string, string | number>;
  /** Non-null when user edited live preview; overrides substitution */
  bodyOverride: string | null;
  isCustom: boolean;
};

export type StoredContractClause = {
  id: string;
  title: string;
  body: string;
  isEnabled: boolean;
  fieldValues: Record<string, string | number>;
  wasModified: boolean;
};

export type ContractWizardDbType =
  | "nda"
  | "msa"
  | "sow"
  | "license"
  | "customer_agreement"
  | "sla_support"
  | "colocation";

export const TEMPLATE_ID_TO_DB_TYPE: Record<string, ContractWizardDbType> = {
  mutual_nda: "nda",
  vendor_msa: "msa",
  sow: "sow",
  software_license: "license",
  customer_agreement: "customer_agreement",
  colocation_lease: "colocation",
  sla_support: "sla_support",
};

export function substituteClausePlaceholders(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => {
    const v = values[key];
    if (v === undefined || v === null || v === "") return `{{${key}}}`;
    return String(v);
  });
}

export function getDisplayedClauseBody(c: WizardClauseState): string {
  if (c.bodyOverride != null && c.bodyOverride.length > 0) return c.bodyOverride;
  return substituteClausePlaceholders(c.bodyTemplate, c.fieldValues);
}

export function defaultFieldValues(clause: Clause): Record<string, string | number> {
  const o: Record<string, string | number> = {};
  for (const f of clause.fields) o[f.id] = f.defaultValue;
  return o;
}

export function clausesFromTemplate(t: ContractTemplate): WizardClauseState[] {
  return t.clauses.map((cl) => ({
    id: cl.id,
    title: cl.title,
    description: cl.description,
    bodyTemplate: cl.body,
    isRequired: cl.isRequired,
    isEnabled: cl.isEnabled,
    category: cl.category,
    fields: cl.fields,
    fieldValues: defaultFieldValues(cl),
    bodyOverride: null,
    isCustom: false,
  }));
}

function fieldValuesMatchDefaults(c: WizardClauseState): boolean {
  for (const f of c.fields) {
    if (c.fieldValues[f.id] !== f.defaultValue) return false;
  }
  return true;
}

/** Serialize all clauses (including disabled) for audit / DB */
export function toStoredClauses(clauses: WizardClauseState[]): StoredContractClause[] {
  return clauses.map((c) => {
    const substituted = substituteClausePlaceholders(c.bodyTemplate, c.fieldValues);
    const hasOverride = c.bodyOverride != null && c.bodyOverride.length > 0;
    const body = hasOverride ? c.bodyOverride! : substituted;
    const wasModified = hasOverride || !fieldValuesMatchDefaults(c);
    return {
      id: c.id,
      title: c.title,
      body,
      isEnabled: c.isEnabled,
      fieldValues: { ...c.fieldValues },
      wasModified,
    };
  });
}

export function getTemplateById(id: string): ContractTemplate | undefined {
  return CONTRACT_TEMPLATES.find((t) => t.id === id);
}

// ── Templates (7) ───────────────────────────────────────────────────────────

const MUTUAL_NDA: ContractTemplate = {
  id: "mutual_nda",
  name: "Mutual Non-Disclosure Agreement",
  shortName: "NDA",
  description: "Non-disclosure agreement — bilateral confidentiality",
  icon: "Shield",
  clauses: [
    {
      id: "nda_definitions",
      title: "1. Definitions",
      description: "Defines key terms used throughout the agreement",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "nda_purpose",
          label: "Purpose of disclosure",
          type: "textarea",
          defaultValue:
            "evaluating a potential business relationship between the parties",
          helperText: "Describe why confidential information will be shared",
        },
      ],
      body: `"Confidential Information" means any and all non-public technical, business, financial, or other information disclosed by one party (the "Disclosing Party") to the other party (the "Receiving Party"), whether orally, in writing, electronically, or by inspection of tangible objects, that is designated as "confidential" or "proprietary" at the time of disclosure or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. 

Confidential Information includes, without limitation: (a) trade secrets, inventions, ideas, processes, formulas, source and object code, data, programs, and other works of authorship; (b) business plans, strategies, financial data, and budgets; (c) customer, vendor, and partner lists and information; (d) product designs, specifications, roadmaps, and technical data; (e) personnel information; and (f) any analysis, compilations, studies, or derivative works prepared by the Receiving Party that contain or reflect such information.

The purpose of disclosing Confidential Information under this Agreement is: {{nda_purpose}}.`,
    },
    {
      id: "nda_exclusions",
      title: "2. Exclusions from Confidential Information",
      description: "Information that is NOT considered confidential",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [],
      body: `Confidential Information does not include information that: (a) is or becomes publicly available through no fault or action of the Receiving Party; (b) was already in the Receiving Party's possession without restriction before disclosure by the Disclosing Party, as demonstrated by written records; (c) is independently developed by the Receiving Party without use of or reference to the Disclosing Party's Confidential Information, as demonstrated by written records; (d) is rightfully received from a third party without restriction and without breach of any obligation of confidentiality; or (e) is required to be disclosed by law, regulation, or court order, provided that the Receiving Party gives the Disclosing Party prompt written notice of such requirement (to the extent legally permitted) and cooperates with any effort to obtain protective treatment of such information.`,
    },
    {
      id: "nda_obligations",
      title: "3. Obligations of Receiving Party",
      description: "How confidential information must be handled",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "nda_care_standard",
          label: "Standard of care",
          type: "select",
          defaultValue:
            "the same degree of care it uses to protect its own confidential information, but in no event less than reasonable care",
          options: [
            "the same degree of care it uses to protect its own confidential information, but in no event less than reasonable care",
            "reasonable care",
            "the highest degree of care",
          ],
        },
      ],
      body: `The Receiving Party shall: (a) hold the Disclosing Party's Confidential Information in strict confidence; (b) not disclose Confidential Information to any third party except as expressly permitted herein; (c) use Confidential Information solely for the Purpose described in Section 1; (d) protect the Disclosing Party's Confidential Information using {{nda_care_standard}}; and (e) limit access to Confidential Information to those of its employees, officers, directors, advisors, and contractors ("Representatives") who have a need to know for the Purpose and who are bound by confidentiality obligations no less protective than those herein.

The Receiving Party shall be responsible for any breach of this Agreement by its Representatives.`,
    },
    {
      id: "nda_term",
      title: "4. Term and Duration",
      description: "How long the agreement and obligations last",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "nda_term_years",
          label: "Agreement term (years)",
          type: "number",
          defaultValue: 2,
          helperText: "How long the parties may exchange confidential information",
        },
        {
          id: "nda_survival_years",
          label: "Confidentiality survival (years)",
          type: "number",
          defaultValue: 3,
          helperText: "How long obligations continue after expiration or termination",
        },
      ],
      body: `This Agreement shall commence on the Effective Date and continue for a period of {{nda_term_years}} year(s), unless earlier terminated by either party upon thirty (30) days' written notice to the other party (the "Term").

The obligations of confidentiality and non-use under this Agreement shall survive expiration or termination of this Agreement for a period of {{nda_survival_years}} year(s) from the date of disclosure of the relevant Confidential Information.`,
    },
    {
      id: "nda_return",
      title: "5. Return and Destruction of Materials",
      description: "What happens to confidential materials when the agreement ends",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "nda_return_days",
          label: "Days to return/destroy materials",
          type: "number",
          defaultValue: 30,
        },
      ],
      body: `Upon termination or expiration of this Agreement, or upon written request by the Disclosing Party, the Receiving Party shall, within {{nda_return_days}} days, at the Disclosing Party's election: (a) return all tangible materials containing Confidential Information; or (b) destroy all such materials and certify such destruction in writing.

Notwithstanding the foregoing, the Receiving Party may retain one archival copy of Confidential Information solely for legal compliance and dispute resolution purposes, subject to continued confidentiality obligations.`,
    },
    {
      id: "nda_no_license",
      title: "6. No License or Warranty",
      description: "Clarifies no IP rights are transferred",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [],
      body: `Nothing in this Agreement grants either party any license, right, title, or interest in the other party's Confidential Information, intellectual property, or other proprietary rights. All Confidential Information remains the sole property of the Disclosing Party.

ALL CONFIDENTIAL INFORMATION IS PROVIDED "AS IS." THE DISCLOSING PARTY MAKES NO WARRANTIES, EXPRESS, IMPLIED, OR OTHERWISE, REGARDING THE ACCURACY, COMPLETENESS, OR PERFORMANCE OF ANY CONFIDENTIAL INFORMATION.`,
    },
    {
      id: "nda_remedies",
      title: "7. Remedies",
      description: "Legal remedies available for breach",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [],
      body: `Each party acknowledges that any breach or threatened breach of this Agreement may cause irreparable harm to the Disclosing Party for which monetary damages would be an inadequate remedy. Accordingly, the Disclosing Party shall be entitled to seek equitable relief, including injunction and specific performance, in addition to all other remedies available at law or in equity, without the necessity of proving actual damages or posting any bond or other security.`,
    },
    {
      id: "nda_nonsolicitation",
      title: "8. Non-Solicitation",
      description: "Restricts hiring of the other party's employees",
      isRequired: false,
      isEnabled: false,
      category: "operational",
      fields: [
        {
          id: "nda_nonsolicit_months",
          label: "Non-solicitation period (months)",
          type: "number",
          defaultValue: 12,
        },
      ],
      body: `During the Term and for {{nda_nonsolicit_months}} months thereafter, neither party shall, directly or indirectly, solicit or hire any employee or contractor of the other party with whom it had contact in connection with the Purpose, without the prior written consent of the other party. This restriction does not apply to general solicitations of employment not specifically directed at the other party's personnel.`,
    },
    {
      id: "nda_general",
      title: "9. General Provisions",
      description: "Governing law, assignment, amendments, entire agreement",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [
        {
          id: "nda_governing_law",
          label: "Governing law jurisdiction",
          type: "text",
          defaultValue: "Republic of India",
          helperText: "e.g., 'Republic of India', 'State of Delaware', 'Singapore'",
        },
      ],
      body: `Governing Law. This Agreement shall be governed by and construed in accordance with the laws of {{nda_governing_law}}, without regard to its conflict of law provisions.

Entire Agreement. This Agreement constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior and contemporaneous agreements, whether oral or written.

Amendment. This Agreement may not be amended except by a written instrument signed by both parties.

Assignment. Neither party may assign this Agreement without the other party's prior written consent, except in connection with a merger, acquisition, or sale of all or substantially all of the assigning party's assets.

Severability. If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.

Counterparts. This Agreement may be executed in counterparts, each of which shall be deemed an original.

Waiver. No failure or delay by either party in exercising any right under this Agreement shall constitute a waiver of that right.`,
    },
  ],
};

const VENDOR_MSA: ContractTemplate = {
  id: "vendor_msa",
  name: "Vendor Master Services Agreement",
  shortName: "MSA",
  description: "Master services agreement for vendor engagements",
  icon: "ScrollText",
  clauses: [
    {
      id: "msa_scope",
      title: "1. Scope of Services",
      description: "Defines the services and how SOWs work",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [],
      body: `The Service Provider shall perform the services ("Services") as described in one or more Statements of Work ("SOW") executed by both parties. Each SOW shall reference this Agreement, describe the specific services, deliverables, timelines, and fees, and shall be subject to all terms and conditions of this Agreement.

In the event of any conflict between the terms of a SOW and this Agreement, the terms of this Agreement shall prevail unless the SOW expressly states that it is intended to supersede a specific provision of this Agreement.

No Services shall commence until a SOW has been executed by authorized representatives of both parties.`,
    },
    {
      id: "msa_payment",
      title: "2. Fees and Payment",
      description: "Payment terms, invoicing, and expenses",
      isRequired: true,
      isEnabled: true,
      category: "commercial",
      fields: [
        { id: "msa_payment_days", label: "Payment terms (days)", type: "number", defaultValue: 30 },
        { id: "msa_late_rate", label: "Late payment interest rate (% per month)", type: "number", defaultValue: 1.5 },
        { id: "msa_expense_approval", label: "Expense pre-approval threshold", type: "currency", defaultValue: "500" },
      ],
      body: `Client shall pay Service Provider the fees set forth in the applicable SOW. Service Provider shall submit invoices monthly in arrears (or as otherwise specified in the SOW). Client shall pay all undisputed invoices within {{msa_payment_days}} days of receipt.

Late payments shall bear interest at the rate of {{msa_late_rate}}% per month, or the maximum rate permitted by law, whichever is lower.

Expenses. Reasonable, pre-approved out-of-pocket expenses shall be reimbursed at cost. Expenses exceeding {{msa_expense_approval}} individually require prior written approval from Client.

Taxes. Fees are exclusive of all taxes. Client shall be responsible for all applicable taxes, excluding taxes based on Service Provider's income.

Disputes. Client may dispute any invoice in good faith by providing written notice within fifteen (15) days of receipt, specifying the disputed items in reasonable detail. Undisputed portions must be paid when due.`,
    },
    {
      id: "msa_ip",
      title: "3. Intellectual Property Ownership",
      description: "Who owns the work product and pre-existing IP",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [
        {
          id: "msa_ip_ownership",
          label: "Work product ownership",
          type: "select",
          defaultValue: "Client owns all deliverables; Provider retains pre-existing IP with license to Client",
          options: [
            "Client owns all deliverables; Provider retains pre-existing IP with license to Client",
            "Provider owns all deliverables; Client receives perpetual license",
            "Joint ownership of deliverables",
          ],
        },
      ],
      body: `Pre-Existing IP. Each party retains all rights in its pre-existing intellectual property. "Pre-Existing IP" means any intellectual property owned or licensed by a party prior to the Effective Date or developed independently outside the scope of this Agreement.

Work Product. {{msa_ip_ownership}}.

License to Pre-Existing IP. To the extent any deliverable incorporates Service Provider's Pre-Existing IP, Service Provider hereby grants Client a non-exclusive, perpetual, irrevocable, royalty-free, worldwide license to use such Pre-Existing IP solely as incorporated in the deliverable for Client's internal business purposes.

Service Provider Tools. Service Provider retains ownership of all tools, methodologies, frameworks, and know-how of general applicability developed or used in performing the Services ("Provider Tools"), even if developed or improved during the engagement.`,
    },
    {
      id: "msa_confidentiality",
      title: "4. Confidentiality",
      description: "Mutual confidentiality obligations",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "msa_conf_survival",
          label: "Confidentiality survival (years after termination)",
          type: "number",
          defaultValue: 3,
        },
      ],
      body: `Each party agrees to hold in confidence all Confidential Information received from the other party and to use such information solely for the purposes of this Agreement. "Confidential Information" means any non-public information disclosed by a party that is designated as confidential or that reasonably should be understood to be confidential.

Exclusions. Confidential Information does not include information that: (a) is or becomes publicly available without breach of this Agreement; (b) was known to the Receiving Party prior to disclosure; (c) is independently developed without use of Confidential Information; or (d) is rightfully received from a third party without restriction.

Obligations survive for {{msa_conf_survival}} years following termination of this Agreement.`,
    },
    {
      id: "msa_warranties",
      title: "5. Representations and Warranties",
      description: "Promises each party makes about quality and authority",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [],
      body: `Service Provider represents and warrants that: (a) it has the right and authority to enter into this Agreement and perform the Services; (b) the Services will be performed in a professional and workmanlike manner consistent with generally accepted industry standards; (c) all deliverables will conform to the specifications in the applicable SOW; (d) the Services and deliverables will not infringe any third party's intellectual property rights; and (e) it will comply with all applicable laws and regulations.

Client represents and warrants that: (a) it has the right and authority to enter into this Agreement; (b) it will provide Service Provider with timely access to resources, information, and personnel reasonably necessary for Service Provider to perform the Services; and (c) it will comply with all applicable laws and regulations.`,
    },
    {
      id: "msa_indemnification",
      title: "6. Indemnification",
      description: "Each party's obligation to protect the other from third-party claims",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [],
      body: `Indemnification by Service Provider. Service Provider shall indemnify, defend, and hold harmless Client and its officers, directors, and employees from and against any third-party claims, damages, losses, liabilities, and expenses (including reasonable attorneys' fees) arising from: (a) Service Provider's material breach of any representation or warranty made herein; (b) the gross negligence, fraud, or wilful misconduct of Service Provider or its personnel; or (c) any claim that the Services or deliverables, as provided by Service Provider and used by Client in accordance with this Agreement, infringe or misappropriate any patent, copyright, trademark, or trade secret of a third party.

Indemnification by Client. Client shall indemnify, defend, and hold harmless Service Provider and its officers, directors, and employees from and against any third-party claims arising from: (a) Client's material breach of this Agreement; (b) Client's use of the deliverables in a manner not authorized by this Agreement or the applicable SOW; (c) the gross negligence, fraud, or wilful misconduct of Client or its personnel; or (d) any claim that materials provided by Client to Service Provider for use in performing the Services infringe the intellectual property rights of a third party.

Indemnification Procedure. The indemnified party shall: (i) promptly notify the indemnifying party in writing of the claim; (ii) grant the indemnifying party sole control over the defense and settlement of the claim (provided that no settlement shall be entered into without the indemnified party's prior written consent, such consent not to be unreasonably withheld); and (iii) provide reasonable cooperation at the indemnifying party's expense.`,
    },
    {
      id: "msa_liability",
      title: "7. Limitation of Liability",
      description: "Caps on financial exposure",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [
        {
          id: "msa_liability_cap",
          label: "Liability cap basis",
          type: "select",
          defaultValue: "total fees paid in the 12 months preceding the claim",
          options: [
            "total fees paid in the 12 months preceding the claim",
            "total fees paid under the applicable SOW",
            "total fees paid under this Agreement",
          ],
        },
      ],
      body: `LIMITATION OF DAMAGES. EXCEPT FOR EACH PARTY'S INDEMNIFICATION OBLIGATIONS UNDER SECTION 6, BREACH OF CONFIDENTIALITY UNDER SECTION 4, OR ACTS OF GROSS NEGLIGENCE, FRAUD, OR WILFUL MISCONDUCT: (A) NEITHER PARTY SHALL BE LIABLE TO THE OTHER FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITY, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES; AND (B) EACH PARTY'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT, WHETHER IN CONTRACT, TORT, OR OTHERWISE, SHALL NOT EXCEED {{msa_liability_cap}}.

The parties acknowledge and agree that the fees set forth in the applicable SOW reflect the allocation of risk set forth in this Agreement and that neither party would enter into this Agreement without these limitations on its liability.`,
    },
    {
      id: "msa_term",
      title: "8. Term and Termination",
      description: "Duration, renewal, and termination rights",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        { id: "msa_initial_term", label: "Initial term (years)", type: "number", defaultValue: 1 },
        { id: "msa_renewal_term", label: "Auto-renewal period (years)", type: "number", defaultValue: 1 },
        { id: "msa_termination_notice", label: "Termination notice (days)", type: "number", defaultValue: 30 },
        { id: "msa_cure_period", label: "Cure period for material breach (days)", type: "number", defaultValue: 30 },
      ],
      body: `Term. This Agreement shall commence on the Effective Date and continue for an initial term of {{msa_initial_term}} year(s), automatically renewing for successive {{msa_renewal_term}}-year periods unless either party provides written notice of non-renewal at least {{msa_termination_notice}} days before the end of the then-current term.

Termination for Convenience. Either party may terminate this Agreement upon {{msa_termination_notice}} days' prior written notice. Client shall pay for all Services performed through the effective date of termination.

Termination for Cause. Either party may terminate this Agreement immediately upon written notice if the other party: (a) materially breaches this Agreement and fails to cure such breach within {{msa_cure_period}} days after written notice; or (b) becomes insolvent, files for bankruptcy, or ceases operations.

Effect of Termination. Upon termination: (a) all outstanding SOWs shall terminate; (b) all fees accrued through the termination date shall become immediately due and payable; (c) each party shall return or destroy the other party's Confidential Information; and (d) Sections that by their nature should survive (including Confidentiality, IP, Indemnification, Limitation of Liability) shall survive termination.`,
    },
    {
      id: "msa_insurance",
      title: "9. Insurance",
      description: "Required insurance coverage",
      isRequired: false,
      isEnabled: true,
      category: "operational",
      fields: [
        { id: "msa_gl_coverage", label: "General liability coverage minimum", type: "currency", defaultValue: "1000000" },
        { id: "msa_pi_coverage", label: "Professional indemnity coverage minimum", type: "currency", defaultValue: "2000000" },
      ],
      body: `Service Provider shall maintain throughout the Term: (a) Commercial General Liability insurance with minimum coverage of {{msa_gl_coverage}}; (b) Professional Indemnity (Errors & Omissions) insurance with minimum coverage of {{msa_pi_coverage}}; and (c) Workers' Compensation insurance as required by applicable law.

Service Provider shall provide certificates of insurance upon Client's request.`,
    },
    {
      id: "msa_data_protection",
      title: "10. Data Protection",
      description: "Obligations regarding personal data processing",
      isRequired: false,
      isEnabled: true,
      category: "legal",
      fields: [
        {
          id: "msa_dp_regime",
          label: "Data protection regime",
          type: "select",
          defaultValue: "DPDP Act (India)",
          options: ["DPDP Act (India)", "GDPR (EU/UK)", "CCPA (California)", "PDPA (Singapore)", "Multiple / Custom"],
        },
      ],
      body: `To the extent Service Provider processes personal data on behalf of Client, Service Provider shall: (a) process such data only in accordance with Client's documented instructions; (b) implement appropriate technical and organisational measures to protect personal data; (c) notify Client without undue delay upon becoming aware of a personal data breach; (d) assist Client in responding to data subject requests; and (e) delete or return all personal data upon termination of the relevant SOW.

The parties shall execute a Data Processing Agreement ("DPA") as required under {{msa_dp_regime}} or other applicable data protection legislation. The DPA shall be incorporated as a schedule to this Agreement.`,
    },
    {
      id: "msa_general",
      title: "11. General Provisions",
      description: "Governing law, dispute resolution, force majeure, notices",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [
        { id: "msa_governing_law", label: "Governing law", type: "text", defaultValue: "Republic of India" },
        {
          id: "msa_dispute_method",
          label: "Dispute resolution",
          type: "select",
          defaultValue: "Courts of the governing jurisdiction",
          options: [
            "Courts of the governing jurisdiction",
            "Binding arbitration (Mumbai Centre for International Arbitration)",
            "Binding arbitration (ICC Rules)",
            "Binding arbitration (LCIA Rules)",
            "Mediation then arbitration",
          ],
        },
      ],
      body: `Governing Law. This Agreement shall be governed by the laws of {{msa_governing_law}}.

Dispute Resolution. Any dispute arising out of or in connection with this Agreement shall be resolved by {{msa_dispute_method}}.

Force Majeure. Neither party shall be liable for failure to perform due to causes beyond its reasonable control, including natural disasters, war, terrorism, pandemics, government actions, or failures of third-party telecommunications or power supply, provided the affected party gives prompt notice and uses reasonable efforts to mitigate the impact.

Independent Contractor. Service Provider is an independent contractor. Nothing in this Agreement creates an employment, partnership, or agency relationship.

Notices. All notices under this Agreement shall be in writing and delivered to the addresses specified on the Cover Page.

Entire Agreement. This Agreement, together with all SOWs and schedules, constitutes the entire agreement between the parties regarding its subject matter.

Amendment. No modification shall be effective unless in writing and signed by authorized representatives of both parties.

Severability. If any provision is held unenforceable, the remainder shall continue in full force.

Assignment. Neither party may assign without prior written consent, except in connection with a merger, acquisition, or sale of substantially all assets.`,
    },
  ],
};

const SOW_TEMPLATE: ContractTemplate = {
  id: "sow",
  name: "Statement of Work",
  shortName: "SOW",
  description: "Project scope, deliverables, and milestones",
  icon: "ListChecks",
  clauses: [
    {
      id: "sow_overview",
      title: "1. Project Overview",
      description: "High-level description of the project",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        { id: "sow_project_name", label: "Project name", type: "text", defaultValue: "" },
        { id: "sow_background", label: "Background and objectives", type: "textarea", defaultValue: "" },
        { id: "sow_ref_msa", label: "Reference MSA number", type: "text", defaultValue: "", helperText: "If this SOW is under an existing MSA" },
      ],
      body: `This Statement of Work ("SOW") is entered into pursuant to the Master Services Agreement dated [MSA Date] between the parties (the "Agreement"), reference {{sow_ref_msa}}.

Project Name: {{sow_project_name}}

Background and Objectives: {{sow_background}}`,
    },
    {
      id: "sow_scope",
      title: "2. Scope of Work",
      description: "Detailed description of what will be delivered",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        { id: "sow_in_scope", label: "In scope", type: "textarea", defaultValue: "" },
        { id: "sow_out_of_scope", label: "Out of scope", type: "textarea", defaultValue: "", helperText: "Explicitly list what is NOT included" },
      ],
      body: `In Scope: {{sow_in_scope}}

Out of Scope: {{sow_out_of_scope}}

Any work requested by Client that falls outside the scope defined above shall require a written Change Order executed by both parties before work commences.`,
    },
    {
      id: "sow_deliverables",
      title: "3. Deliverables",
      description: "Specific outputs to be produced",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "sow_deliverable_list",
          label: "Deliverables",
          type: "textarea",
          defaultValue: "",
          helperText: "List each deliverable with description and acceptance criteria",
        },
      ],
      body: `Service Provider shall produce the following deliverables:

{{sow_deliverable_list}}

Each deliverable shall be subject to the acceptance procedures defined in Section 5.`,
    },
    {
      id: "sow_timeline",
      title: "4. Timeline and Milestones",
      description: "Project schedule with key dates",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        { id: "sow_start_date", label: "Project start date", type: "date", defaultValue: "" },
        { id: "sow_end_date", label: "Estimated completion date", type: "date", defaultValue: "" },
        { id: "sow_milestones", label: "Milestones", type: "textarea", defaultValue: "", helperText: "List milestones with target dates" },
      ],
      body: `Project Start Date: {{sow_start_date}}
Estimated Completion Date: {{sow_end_date}}

Milestones:
{{sow_milestones}}

Timelines are estimates and may be adjusted by mutual written agreement. Delays caused by Client's failure to provide timely access, approvals, or resources shall extend timelines accordingly.`,
    },
    {
      id: "sow_acceptance",
      title: "5. Acceptance Procedures",
      description: "How deliverables are reviewed and accepted",
      isRequired: true,
      isEnabled: true,
      category: "operational",
      fields: [
        { id: "sow_review_days", label: "Review period (business days)", type: "number", defaultValue: 5 },
        { id: "sow_correction_days", label: "Correction period (business days)", type: "number", defaultValue: 10 },
      ],
      body: `Upon delivery of each deliverable, Client shall have {{sow_review_days}} business days to review and either accept the deliverable or provide written notice of rejection specifying deficiencies in reasonable detail ("Review Period").

If Client rejects a deliverable, Service Provider shall correct the identified deficiencies within {{sow_correction_days}} business days and resubmit for review.

If Client does not respond within the Review Period, the deliverable shall be deemed accepted.`,
    },
    {
      id: "sow_fees",
      title: "6. Fees and Payment Schedule",
      description: "Pricing and payment milestones",
      isRequired: true,
      isEnabled: true,
      category: "commercial",
      fields: [
        {
          id: "sow_pricing_model",
          label: "Pricing model",
          type: "select",
          defaultValue: "Fixed price",
          options: ["Fixed price", "Time and materials", "Milestone-based", "Blended (fixed + T&M)"],
        },
        { id: "sow_total_value", label: "Total SOW value", type: "currency", defaultValue: "" },
        { id: "sow_rate_card", label: "Rate card (if T&M)", type: "textarea", defaultValue: "", helperText: "Role: hourly/daily rate" },
      ],
      body: `Pricing Model: {{sow_pricing_model}}
Total SOW Value: {{sow_total_value}}

{{sow_rate_card}}

Payment shall be made in accordance with the payment terms of the governing MSA. If no MSA exists, payment is due within thirty (30) days of invoice.`,
    },
    {
      id: "sow_change_control",
      title: "7. Change Control",
      description: "Process for handling scope changes",
      isRequired: true,
      isEnabled: true,
      category: "operational",
      fields: [],
      body: `Either party may request changes to the scope, timeline, or fees by submitting a written Change Request. No change shall take effect until a Change Order has been executed by authorized representatives of both parties.

Each Change Order shall specify: (a) the nature of the change; (b) impact on scope, deliverables, and timeline; (c) impact on fees; and (d) any additional terms.

Service Provider shall not perform work outside the agreed scope without an executed Change Order.`,
    },
    {
      id: "sow_dependencies",
      title: "8. Assumptions and Dependencies",
      description: "Client responsibilities and project assumptions",
      isRequired: false,
      isEnabled: true,
      category: "operational",
      fields: [
        { id: "sow_assumptions", label: "Key assumptions", type: "textarea", defaultValue: "" },
        { id: "sow_client_responsibilities", label: "Client responsibilities", type: "textarea", defaultValue: "" },
      ],
      body: `This SOW is based on the following assumptions:
{{sow_assumptions}}

Client Responsibilities:
{{sow_client_responsibilities}}

Changes to these assumptions or failure to fulfil Client responsibilities may result in scope, timeline, or cost adjustments via the Change Control process.`,
    },
    {
      id: "sow_personnel",
      title: "9. Key Personnel",
      description: "Named individuals assigned to the project",
      isRequired: false,
      isEnabled: false,
      category: "operational",
      fields: [
        {
          id: "sow_key_staff",
          label: "Key personnel",
          type: "textarea",
          defaultValue: "",
          helperText: "Name — Role — Allocation %",
        },
      ],
      body: `The following individuals are designated as Key Personnel for this SOW:

{{sow_key_staff}}

Service Provider shall not remove or replace Key Personnel without Client's prior written consent, except for reasons beyond Service Provider's reasonable control (e.g., resignation, illness). Service Provider shall provide a replacement of comparable qualifications within a reasonable timeframe.`,
    },
  ],
};

const SOFTWARE_LICENSE: ContractTemplate = {
  id: "software_license",
  name: "Software License Agreement",
  shortName: "Software License",
  description: "Software licensing agreement for commercial software",
  icon: "Package",
  clauses: [
    {
      id: "sl_grant",
      title: "1. License Grant",
      description: "The rights being granted to use the software",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "sl_license_type",
          label: "License type",
          type: "select",
          defaultValue: "Non-exclusive, non-transferable",
          options: ["Non-exclusive, non-transferable", "Non-exclusive, transferable", "Exclusive"],
        },
        {
          id: "sl_license_scope",
          label: "License scope",
          type: "select",
          defaultValue: "Per-seat (named user)",
          options: [
            "Per-seat (named user)",
            "Per-seat (concurrent)",
            "Site license",
            "Enterprise-wide",
            "Per-device",
            "Usage-based",
          ],
        },
        { id: "sl_seat_count", label: "Number of authorized users/seats", type: "number", defaultValue: 10 },
        { id: "sl_territory", label: "Territory", type: "text", defaultValue: "Worldwide" },
      ],
      body: `Subject to the terms of this Agreement and payment of applicable fees, Licensor grants Licensee a {{sl_license_type}} license to use the Software identified in the applicable Order Form solely for Licensee's internal business purposes.

License Scope: {{sl_license_scope}}
Authorized Users/Seats: {{sl_seat_count}}
Territory: {{sl_territory}}

The license granted herein does not include the right to: (a) sublicense, rent, lease, or lend the Software to any third party; (b) modify, adapt, translate, reverse engineer, decompile, or disassemble the Software; (c) remove or alter any proprietary notices; or (d) use the Software for the benefit of any third party, including as part of a service bureau or outsourcing arrangement, without Licensor's prior written consent.`,
    },
    {
      id: "sl_restrictions",
      title: "2. Restrictions and Acceptable Use",
      description: "What the licensee cannot do with the software",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [],
      body: `Licensee shall not, and shall not permit any third party to: (a) copy or duplicate the Software except for reasonable backup purposes; (b) sell, assign, sublicense, or transfer the license to any third party; (c) use the Software to develop a competing product or service; (d) use the Software in any manner that violates applicable laws or regulations; (e) introduce malicious code into or through the Software; (f) circumvent or disable any security or usage-limiting features; or (g) use the Software in excess of the licensed capacity.

Licensee is responsible for ensuring that all authorized users comply with the terms of this Agreement.`,
    },
    {
      id: "sl_support",
      title: "3. Support and Maintenance",
      description: "What support and updates are included",
      isRequired: true,
      isEnabled: true,
      category: "operational",
      fields: [
        {
          id: "sl_support_level",
          label: "Support tier",
          type: "select",
          defaultValue: "Standard (business hours, email)",
          options: [
            "Standard (business hours, email)",
            "Premium (24/7, phone + email)",
            "Enterprise (24/7, dedicated TAM)",
          ],
        },
        {
          id: "sl_update_policy",
          label: "Update policy",
          type: "select",
          defaultValue: "Minor updates and patches included; major versions at additional cost",
          options: [
            "All updates and upgrades included",
            "Minor updates and patches included; major versions at additional cost",
            "Updates available separately",
          ],
        },
      ],
      body: `Licensor shall provide support and maintenance services as follows:

Support Level: {{sl_support_level}}
Update Policy: {{sl_update_policy}}

Support includes: (a) reasonable efforts to resolve reported errors; (b) provision of patches, bug fixes, and minor updates; and (c) access to online documentation and knowledge base.

Licensor shall use commercially reasonable efforts to respond to support requests within the timeframes specified in the applicable Service Level Agreement, if any.`,
    },
    {
      id: "sl_fees",
      title: "4. Fees and Payment",
      description: "License fees and payment terms",
      isRequired: true,
      isEnabled: true,
      category: "commercial",
      fields: [
        {
          id: "sl_fee_model",
          label: "Fee model",
          type: "select",
          defaultValue: "Annual subscription",
          options: ["Annual subscription", "Monthly subscription", "Perpetual license + annual maintenance", "Usage-based"],
        },
        { id: "sl_payment_terms", label: "Payment terms (days)", type: "number", defaultValue: 30 },
      ],
      body: `Licensee shall pay the license fees as set forth in the applicable Order Form.

Fee Model: {{sl_fee_model}}
Payment Terms: Net {{sl_payment_terms}} days from invoice date.

For subscription licenses, fees are due in advance of each subscription period. Licensor may increase subscription fees upon renewal by providing at least sixty (60) days' prior written notice.

Non-payment. If fees remain unpaid for more than fifteen (15) days past the due date, Licensor may, upon written notice, suspend Licensee's access to the Software until payment is received.`,
    },
    {
      id: "sl_warranty",
      title: "5. Warranty",
      description: "Promises about software performance",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [{ id: "sl_warranty_period", label: "Warranty period (days from delivery)", type: "number", defaultValue: 90 }],
      body: `Licensor warrants that for a period of {{sl_warranty_period}} days from delivery (the "Warranty Period"), the Software will perform substantially in accordance with the documentation.

Licensor's sole obligation for breach of this warranty shall be to, at Licensor's option: (a) repair or replace the non-conforming Software; or (b) refund the fees paid for the non-conforming Software.

EXCEPT AS EXPRESSLY SET FORTH HEREIN, THE SOFTWARE IS PROVIDED "AS IS" AND LICENSOR DISCLAIMS ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.`,
    },
    {
      id: "sl_data",
      title: "6. Data Ownership and Privacy",
      description: "Who owns data processed by the software",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [],
      body: `Licensee Data. As between the parties, Licensee retains all rights, title, and interest in and to all data input into or generated through Licensee's use of the Software ("Licensee Data"). Licensor shall not access, use, or disclose Licensee Data except as necessary to provide the Software and related services, or as required by law.

Aggregated Data. Licensor may collect and use anonymized, aggregated data derived from Licensee's use of the Software for product improvement, analytics, and benchmarking purposes, provided such data cannot reasonably be used to identify Licensee or any individual.

Data Protection. Licensor shall implement and maintain industry-standard technical and organizational security measures to protect Licensee Data. In the event of a data breach affecting Licensee Data, Licensor shall notify Licensee within seventy-two (72) hours of discovery.`,
    },
    {
      id: "sl_liability",
      title: "7. Limitation of Liability",
      description: "Caps on damages",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [],
      body: `EXCEPT FOR BREACH OF LICENSE RESTRICTIONS OR CONFIDENTIALITY OBLIGATIONS: (A) NEITHER PARTY SHALL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES; AND (B) EACH PARTY'S TOTAL LIABILITY SHALL NOT EXCEED THE FEES PAID BY LICENSEE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.`,
    },
    {
      id: "sl_term",
      title: "8. Term and Termination",
      description: "License duration and termination rights",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "sl_initial_term",
          label: "Initial term",
          type: "select",
          defaultValue: "1 year",
          options: ["1 year", "2 years", "3 years", "Perpetual"],
        },
        { id: "sl_auto_renew", label: "Auto-renew", type: "select", defaultValue: "Yes", options: ["Yes", "No"] },
      ],
      body: `Term. This Agreement shall commence on the Effective Date and continue for {{sl_initial_term}}, auto-renewing: {{sl_auto_renew}}.

Termination for Breach. Either party may terminate upon thirty (30) days' written notice if the other party materially breaches and fails to cure.

Effect of Termination. Upon termination: (a) all license rights cease immediately; (b) Licensee shall cease use of the Software and destroy all copies; (c) Licensor shall, upon request, provide Licensee's data in a standard format within thirty (30) days; and (d) accrued payment obligations survive.`,
    },
  ],
};

const CUSTOMER_AGREEMENT: ContractTemplate = {
  id: "customer_agreement",
  name: "Customer Agreement",
  shortName: "Customer Agreement",
  description: "Commercial agreement with a customer",
  icon: "Handshake",
  clauses: [
    {
      id: "ca_services",
      title: "1. Services",
      description: "Scope of services under order forms",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [{ id: "ca_service_desc", label: "Description of services", type: "textarea", defaultValue: "" }],
      body: `Provider shall provide the services described in each Order Form executed under this Agreement (the "Services"). {{ca_service_desc}}

The specific scope, deliverables, service levels, and fees for each engagement shall be defined in the applicable Order Form, which is incorporated into this Agreement by reference.`,
    },
    {
      id: "ca_fees",
      title: "2. Fees and Payment",
      description: "Billing and payment terms",
      isRequired: true,
      isEnabled: true,
      category: "commercial",
      fields: [
        { id: "ca_payment_terms", label: "Payment terms (days)", type: "number", defaultValue: 30 },
        {
          id: "ca_billing_frequency",
          label: "Billing frequency",
          type: "select",
          defaultValue: "Monthly in arrears",
          options: ["Monthly in arrears", "Quarterly in advance", "Annually in advance", "Upon delivery"],
        },
      ],
      body: `Customer shall pay the fees as set forth in the applicable Order Form. Billing: {{ca_billing_frequency}}. Payment due: Net {{ca_payment_terms}} days. Late payments accrue interest at 1.5% per month or the maximum legal rate, whichever is lower. All fees are exclusive of applicable taxes, which are Customer's responsibility.`,
    },
    {
      id: "ca_sla",
      title: "3. Service Level Agreement",
      description: "Uptime and service credits",
      isRequired: false,
      isEnabled: true,
      category: "operational",
      fields: [
        { id: "ca_uptime", label: "Uptime commitment (%)", type: "number", defaultValue: 99.9 },
        {
          id: "ca_credit_pct",
          label: "Service credit (% of monthly fee per 0.1% below target)",
          type: "number",
          defaultValue: 5,
        },
      ],
      body: `Provider commits to {{ca_uptime}}% availability of the Services during each calendar month, excluding scheduled maintenance windows. If Provider fails to meet this target, Customer shall receive a service credit of {{ca_credit_pct}}% of the applicable monthly fee for each 0.1% shortfall, up to a maximum of 30% of the monthly fee. Service credits are Customer's sole remedy for availability shortfalls.`,
    },
    {
      id: "ca_data_protection",
      title: "4. Data Protection",
      description: "Personal data and security",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [],
      body: `Provider shall process Customer's personal data only in accordance with Customer's documented instructions and applicable data protection laws. Provider shall implement appropriate technical and organizational security measures, notify Customer of any data breach within 72 hours, and assist with data subject requests and regulatory inquiries. A Data Processing Agreement shall be executed as a schedule to this Agreement.`,
    },
    {
      id: "ca_confidentiality",
      title: "5. Confidentiality",
      description: "Mutual confidentiality",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [],
      body: `Each party shall hold the other's Confidential Information in confidence using at least the same degree of care it uses for its own, but no less than reasonable care. Obligations survive for three (3) years after termination. Standard exclusions apply (publicly available, independently developed, prior knowledge, lawful third-party receipt).`,
    },
    {
      id: "ca_ip",
      title: "6. Intellectual Property",
      description: "Ownership of services and data",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [],
      body: `Provider retains all rights in the Services, platform, and underlying technology. Customer retains all rights in Customer Data. Provider grants Customer a non-exclusive license to use the Services during the Term as specified in the Order Form. Neither party acquires rights in the other's pre-existing IP except as expressly stated.`,
    },
    {
      id: "ca_liability",
      title: "7. Limitation of Liability",
      description: "Liability caps and exclusions",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [],
      body: `NEITHER PARTY SHALL BE LIABLE FOR INDIRECT, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES. EACH PARTY'S TOTAL LIABILITY SHALL NOT EXCEED THE FEES PAID OR PAYABLE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM. These limitations do not apply to: breach of confidentiality, IP infringement indemnification, gross negligence, or wilful misconduct.`,
    },
    {
      id: "ca_term",
      title: "8. Term and Termination",
      description: "Duration and exit",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "ca_term_length",
          label: "Initial term",
          type: "select",
          defaultValue: "1 year",
          options: ["1 year", "2 years", "3 years", "Month-to-month"],
        },
        { id: "ca_termination_notice", label: "Termination notice (days)", type: "number", defaultValue: 30 },
      ],
      body: `Initial term: {{ca_term_length}}. Either party may terminate for convenience with {{ca_termination_notice}} days' notice, or immediately for material uncured breach (30-day cure period). Upon termination, Provider shall make Customer Data available for export for 30 days.`,
    },
    {
      id: "ca_general",
      title: "9. General Provisions",
      description: "Governing law and boilerplate",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [{ id: "ca_governing_law", label: "Governing law", type: "text", defaultValue: "Republic of India" }],
      body: `Governing Law: {{ca_governing_law}}. This Agreement constitutes the entire agreement. Amendments require mutual written consent. Assignment only with consent except for M&A. Severability, waiver, and force majeure provisions apply. Notices in writing to addresses on the Cover Page.`,
    },
  ],
};

const COLOCATION_LEASE: ContractTemplate = {
  id: "colocation_lease",
  name: "Colocation / Lease Agreement",
  shortName: "Colocation",
  description: "Data center or real estate lease agreement",
  icon: "Building2",
  clauses: [
    {
      id: "cl_premises",
      title: "1. Premises",
      description: "Facility and space description",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        { id: "cl_facility", label: "Facility name and address", type: "textarea", defaultValue: "" },
        {
          id: "cl_space_type",
          label: "Space type",
          type: "select",
          defaultValue: "Private cage",
          options: ["Full cabinet/rack", "Private cage", "Private suite", "Shared cabinet", "Custom space"],
        },
        { id: "cl_space_size", label: "Space specification", type: "text", defaultValue: "", helperText: "e.g., '4 racks, 42U each' or '500 sq ft'" },
      ],
      body: `Provider shall make available to Customer the following space at the Facility: {{cl_facility}}.

Space Type: {{cl_space_type}}
Specification: {{cl_space_size}}

Customer shall have 24/7 physical access to the Premises, subject to Provider's reasonable security and access control procedures.`,
    },
    {
      id: "cl_term",
      title: "2. Term",
      description: "Lease duration and renewal",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "cl_lease_term",
          label: "Lease term",
          type: "select",
          defaultValue: "36 months",
          options: ["12 months", "24 months", "36 months", "60 months", "Custom"],
        },
        { id: "cl_commencement", label: "Commencement date", type: "date", defaultValue: "" },
      ],
      body: `The initial term shall be {{cl_lease_term}} commencing on {{cl_commencement}} (the "Commencement Date"). The Agreement auto-renews for successive twelve (12) month periods unless either party provides ninety (90) days' prior written notice of non-renewal.`,
    },
    {
      id: "cl_rent",
      title: "3. Rent and Fees",
      description: "Charges and escalation",
      isRequired: true,
      isEnabled: true,
      category: "commercial",
      fields: [
        { id: "cl_monthly_rent", label: "Monthly recurring charge", type: "currency", defaultValue: "" },
        { id: "cl_escalation", label: "Annual escalation (%)", type: "number", defaultValue: 3 },
        { id: "cl_setup_fee", label: "One-time setup fee", type: "currency", defaultValue: "0" },
      ],
      body: `Monthly Recurring Charge: {{cl_monthly_rent}}, payable in advance on the first of each month. One-time setup fee: {{cl_setup_fee}}, due upon execution.

Annual Escalation. The monthly charge shall increase by {{cl_escalation}}% on each anniversary of the Commencement Date.

The monthly charge includes base rent and standard services. Power, connectivity, and additional services are charged separately as specified in Schedule B.`,
    },
    {
      id: "cl_power",
      title: "4. Power Allocation",
      description: "Committed power and overage",
      isRequired: true,
      isEnabled: true,
      category: "operational",
      fields: [
        { id: "cl_power_kw", label: "Committed power (kW)", type: "number", defaultValue: 5 },
        { id: "cl_power_rate", label: "Overage rate (per kWh)", type: "currency", defaultValue: "0.15" },
        {
          id: "cl_power_redundancy",
          label: "Power redundancy",
          type: "select",
          defaultValue: "N+1",
          options: ["N", "N+1", "2N", "2N+1"],
        },
      ],
      body: `Provider shall supply {{cl_power_kw}} kW of power to Customer's Premises with {{cl_power_redundancy}} redundancy. Power consumption exceeding the committed allocation shall be billed at {{cl_power_rate}} per kWh overage.

Provider shall maintain uninterruptible power supply (UPS) and backup generator systems to support the specified redundancy level.`,
    },
    {
      id: "cl_sla",
      title: "5. Service Levels",
      description: "Uptime and environmental SLAs",
      isRequired: true,
      isEnabled: true,
      category: "operational",
      fields: [
        { id: "cl_uptime_sla", label: "Uptime SLA (%)", type: "number", defaultValue: 99.99 },
        { id: "cl_temp_range", label: "Temperature range (°C)", type: "text", defaultValue: "18-27" },
        { id: "cl_humidity_range", label: "Humidity range (%RH)", type: "text", defaultValue: "40-60" },
      ],
      body: `Provider guarantees {{cl_uptime_sla}}% availability of power and cooling to the Premises per calendar month.

Environmental Controls. Provider shall maintain: Temperature: {{cl_temp_range}}°C; Relative Humidity: {{cl_humidity_range}}%.

Service Credits. For each 0.1% below the uptime target, Customer receives a credit of 5% of the monthly charge, up to 100% of the monthly charge. Credits are Customer's sole remedy for service level failures.`,
    },
    {
      id: "cl_security",
      title: "6. Physical Security",
      description: "Access control and surveillance",
      isRequired: true,
      isEnabled: true,
      category: "operational",
      fields: [],
      body: `Provider shall maintain physical security including: (a) 24/7 staffed security or monitoring; (b) biometric or multi-factor access control; (c) CCTV surveillance with minimum 90-day retention; (d) man-trap entry systems; and (e) visitor management procedures.

Customer shall comply with Provider's access policies and maintain an authorized access list, which may be updated upon written notice.`,
    },
    {
      id: "cl_insurance",
      title: "7. Insurance and Liability",
      description: "Insurance requirements and caps",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [{ id: "cl_customer_insurance", label: "Customer insurance minimum", type: "currency", defaultValue: "1000000" }],
      body: `Customer shall maintain property and liability insurance covering Customer's equipment with minimum coverage of {{cl_customer_insurance}}. Customer shall name Provider as additional insured.

Provider shall maintain commercial general liability, property, and professional liability insurance appropriate for data center operations.

PROVIDER'S TOTAL LIABILITY SHALL NOT EXCEED THE MONTHLY CHARGES PAID IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM. NEITHER PARTY SHALL BE LIABLE FOR INDIRECT OR CONSEQUENTIAL DAMAGES EXCEPT FOR BREACH OF CONFIDENTIALITY.`,
    },
    {
      id: "cl_termination",
      title: "8. Termination",
      description: "Early exit and equipment removal",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        {
          id: "cl_early_termination_months",
          label: "Early termination fee (months of remaining rent)",
          type: "number",
          defaultValue: 6,
        },
        { id: "cl_removal_days", label: "Equipment removal period (days after termination)", type: "number", defaultValue: 30 },
      ],
      body: `Early Termination. Customer may terminate prior to the end of the term by paying an early termination fee equal to {{cl_early_termination_months}} months of the then-current monthly charge.

Equipment Removal. Customer shall remove all equipment within {{cl_removal_days}} days of termination. Equipment remaining after this period may be disposed of by Provider at Customer's cost.

Termination for Cause. Either party may terminate upon thirty (30) days' notice for material uncured breach.`,
    },
    {
      id: "cl_general",
      title: "9. General Provisions",
      description: "Governing law and notices",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [{ id: "cl_governing_law", label: "Governing law", type: "text", defaultValue: "Republic of India" }],
      body: `Governing Law: {{cl_governing_law}}. Force majeure applies. Assignment requires consent except for M&A. Notices in writing. Entire agreement; amendments require mutual written consent.`,
    },
  ],
};

const SLA_SUPPORT: ContractTemplate = {
  id: "sla_support",
  name: "SLA / Support Agreement",
  shortName: "SLA / Support",
  description: "Service level and support commitment agreement",
  icon: "Headphones",
  clauses: [
    {
      id: "sla_service_levels",
      title: "1. Service Levels",
      description: "Measurable performance commitments",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        { id: "sla_availability", label: "Service availability (%)", type: "number", defaultValue: 99.9 },
        {
          id: "sla_measurement",
          label: "Measurement period",
          type: "select",
          defaultValue: "Calendar month",
          options: ["Calendar month", "Calendar quarter", "Rolling 30 days"],
        },
        {
          id: "sla_exclusions",
          label: "Exclusions from uptime calculation",
          type: "textarea",
          defaultValue:
            "Scheduled maintenance windows (notified 48 hours in advance), force majeure events, issues caused by Customer's equipment or software",
        },
      ],
      body: `Provider commits to maintaining {{sla_availability}}% availability of the Services during each {{sla_measurement}}.

Availability is calculated as: ((Total Minutes - Downtime Minutes) / Total Minutes) × 100

Excluded from downtime calculations: {{sla_exclusions}}`,
    },
    {
      id: "sla_response_times",
      title: "2. Response and Resolution Times",
      description: "Priority-based targets",
      isRequired: true,
      isEnabled: true,
      category: "core",
      fields: [
        { id: "sla_p1_response", label: "P1 (Critical) response time", type: "text", defaultValue: "15 minutes" },
        { id: "sla_p1_resolution", label: "P1 (Critical) resolution target", type: "text", defaultValue: "4 hours" },
        { id: "sla_p2_response", label: "P2 (High) response time", type: "text", defaultValue: "30 minutes" },
        { id: "sla_p2_resolution", label: "P2 (High) resolution target", type: "text", defaultValue: "8 hours" },
        { id: "sla_p3_response", label: "P3 (Medium) response time", type: "text", defaultValue: "4 hours" },
        { id: "sla_p3_resolution", label: "P3 (Medium) resolution target", type: "text", defaultValue: "2 business days" },
        { id: "sla_p4_response", label: "P4 (Low) response time", type: "text", defaultValue: "1 business day" },
        { id: "sla_p4_resolution", label: "P4 (Low) resolution target", type: "text", defaultValue: "5 business days" },
      ],
      body: `Provider shall respond to and resolve incidents according to the following service levels:

| Priority | Description | Response Time | Resolution Target |
|----------|-------------|---------------|-------------------|
| P1 — Critical | Service is down or severely impaired for all users | {{sla_p1_response}} | {{sla_p1_resolution}} |
| P2 — High | Major functionality impaired; no workaround available | {{sla_p2_response}} | {{sla_p2_resolution}} |
| P3 — Medium | Functionality impaired; workaround available | {{sla_p3_response}} | {{sla_p3_resolution}} |
| P4 — Low | Minor issue; cosmetic or informational | {{sla_p4_response}} | {{sla_p4_resolution}} |

Response time is measured from when Provider receives a properly submitted support request to the first meaningful response (not an auto-acknowledgement). Resolution target is measured from initial report to resolution or provision of an acceptable workaround.`,
    },
    {
      id: "sla_support_channels",
      title: "3. Support Channels and Hours",
      description: "How to reach support",
      isRequired: true,
      isEnabled: true,
      category: "operational",
      fields: [
        {
          id: "sla_support_hours",
          label: "Support hours",
          type: "select",
          defaultValue: "24/7 for P1/P2; Business hours for P3/P4",
          options: ["24/7 for all priorities", "24/7 for P1/P2; Business hours for P3/P4", "Business hours only (Mon-Fri 9am-6pm)"],
        },
        {
          id: "sla_channels",
          label: "Support channels",
          type: "textarea",
          defaultValue:
            "Email: support@company.com\nPhone: +91 XXXXX XXXXX (P1/P2 only)\nPortal: https://support.company.com\nSlack: Shared channel (if applicable)",
        },
      ],
      body: `Support Availability: {{sla_support_hours}}

Support Channels:
{{sla_channels}}

P1 incidents must be reported by phone or the emergency channel. Email-only P1 reports may experience delayed response as they are not monitored in real-time outside business hours.`,
    },
    {
      id: "sla_escalation",
      title: "4. Escalation Procedures",
      description: "Escalation path for unresolved issues",
      isRequired: true,
      isEnabled: true,
      category: "operational",
      fields: [],
      body: `If a support request is not resolved within the target resolution time, it shall be escalated as follows:

Level 1 (initial response): Support Engineer
Level 2 (response target exceeded): Senior Engineer / Team Lead
Level 3 (resolution target exceeded): Engineering Manager
Level 4 (2× resolution target exceeded): VP of Engineering / Customer Success Director

Customer may request escalation at any time by contacting their designated account manager.

For P1 incidents, Provider shall provide status updates every thirty (30) minutes until resolution.`,
    },
    {
      id: "sla_credits",
      title: "5. Service Credits",
      description: "Remedies when SLAs are missed",
      isRequired: true,
      isEnabled: true,
      category: "commercial",
      fields: [
        { id: "sla_credit_rate", label: "Credit rate (% per 0.1% below target)", type: "number", defaultValue: 5 },
        { id: "sla_credit_cap", label: "Maximum credit (% of monthly fee)", type: "number", defaultValue: 30 },
        { id: "sla_credit_claim_days", label: "Days to claim credit after incident", type: "number", defaultValue: 30 },
      ],
      body: `If Provider fails to meet the committed service levels, Customer shall be entitled to service credits as follows:

For each 0.1% of availability below the committed target: {{sla_credit_rate}}% of the applicable monthly fee.

Maximum credit per calendar month: {{sla_credit_cap}}% of the applicable monthly fee.

To claim a service credit, Customer must submit a written request within {{sla_credit_claim_days}} days of the end of the month in which the failure occurred.

Service credits shall be applied against future invoices. Service credits are Customer's sole and exclusive remedy for failure to meet service levels.`,
    },
    {
      id: "sla_maintenance",
      title: "6. Scheduled Maintenance",
      description: "Planned downtime rules",
      isRequired: true,
      isEnabled: true,
      category: "operational",
      fields: [
        { id: "sla_maintenance_window", label: "Preferred maintenance window", type: "text", defaultValue: "Sundays 02:00-06:00 UTC" },
        { id: "sla_maintenance_notice", label: "Advance notice required (hours)", type: "number", defaultValue: 48 },
        { id: "sla_emergency_notice", label: "Emergency maintenance notice (hours)", type: "number", defaultValue: 4 },
      ],
      body: `Scheduled Maintenance. Provider shall perform routine maintenance during the preferred window: {{sla_maintenance_window}}. Provider shall provide at least {{sla_maintenance_notice}} hours' advance notice for scheduled maintenance.

Emergency Maintenance. In the event of an urgent security vulnerability or critical issue, Provider may perform emergency maintenance with a minimum of {{sla_emergency_notice}} hours' notice. Emergency maintenance will be excluded from uptime calculations provided it does not exceed four (4) hours per month.`,
    },
    {
      id: "sla_reporting",
      title: "7. Reporting and Reviews",
      description: "Performance reporting cadence",
      isRequired: false,
      isEnabled: true,
      category: "operational",
      fields: [
        {
          id: "sla_report_frequency",
          label: "Report frequency",
          type: "select",
          defaultValue: "Monthly",
          options: ["Weekly", "Monthly", "Quarterly"],
        },
      ],
      body: `Provider shall deliver {{sla_report_frequency}} service level reports including: (a) actual availability vs. target; (b) incident summary by priority; (c) average response and resolution times; (d) open issues and remediation plans; and (e) any service credits accrued.

The parties shall conduct quarterly service reviews to discuss performance, improvement opportunities, and upcoming changes. Each party shall designate a primary contact for SLA-related communications.`,
    },
    {
      id: "sla_general",
      title: "8. General Provisions",
      description: "Term and governing law",
      isRequired: true,
      isEnabled: true,
      category: "legal",
      fields: [
        { id: "sla_governing_law", label: "Governing law", type: "text", defaultValue: "Republic of India" },
        {
          id: "sla_term",
          label: "Agreement term",
          type: "select",
          defaultValue: "Co-terminus with the underlying service agreement",
          options: [
            "Co-terminus with the underlying service agreement",
            "1 year",
            "2 years",
            "3 years",
          ],
        },
      ],
      body: `Term. This SLA is effective for: {{sla_term}}.

Governing Law: {{sla_governing_law}}.

This SLA is supplemental to and forms part of the underlying service agreement between the parties. In the event of a conflict, the underlying service agreement shall prevail unless this SLA expressly states otherwise.

Amendments to service levels require mutual written agreement with at least thirty (30) days' notice.`,
    },
  ],
};

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  MUTUAL_NDA,
  VENDOR_MSA,
  SOW_TEMPLATE,
  SOFTWARE_LICENSE,
  CUSTOMER_AGREEMENT,
  COLOCATION_LEASE,
  SLA_SUPPORT,
];

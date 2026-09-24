import type { WizardStepId } from './types';

export type FieldRule = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'url' | 'select' | 'number' | 'checkbox';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  exactLength?: number;
  pattern?: RegExp;
  min?: number;
  options?: string[];
  placeholder?: string;
};

export const STEP_FIELD_RULES: Record<WizardStepId, FieldRule[]> = {
  1: [],
  2: [
    { key: 'companyName', label: 'Company Name', type: 'text', required: true, minLength: 2, maxLength: 120 },
    { key: 'industry', label: 'Industry', type: 'select', required: true, options: [] },
    { key: 'companySize', label: 'Company Size', type: 'select', required: true, options: [] },
    { key: 'city', label: 'City', type: 'text', required: true, minLength: 2, maxLength: 60 },
    { key: 'state', label: 'State', type: 'select', required: true, options: [] },
    { key: 'website', label: 'Website', type: 'url', required: false, pattern: /^https?:\/\/.+/ },
    { key: 'supportEmail', label: 'Support Email', type: 'email', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  ],
  3: [
    { key: 'gstin', label: 'GSTIN', type: 'text', required: true, exactLength: 15, pattern: /^[0-9A-Z]{15}$/ },
    { key: 'pan', label: 'PAN', type: 'text', required: true, exactLength: 10, pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/ },
    { key: 'cin', label: 'CIN', type: 'text', required: false, exactLength: 21, pattern: /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/ },
    { key: 'tan', label: 'TAN', type: 'text', required: false, exactLength: 10, pattern: /^[A-Z]{4}[0-9]{5}[A-Z]$/ },
    { key: 'epfCode', label: 'EPF Code', type: 'text', required: false, minLength: 4, maxLength: 22 },
    { key: 'primaryStateCode', label: 'Primary State Code', type: 'text', required: true, exactLength: 2, pattern: /^[A-Z]{2}$/ },
  ],
  4: [],
  5: [
    { key: 'p1Critical', label: 'P1 Critical (hrs)', type: 'number', required: true, min: 1 },
    { key: 'p2High', label: 'P2 High (hrs)', type: 'number', required: true, min: 1 },
    { key: 'p3Medium', label: 'P3 Medium (hrs)', type: 'number', required: true, min: 1 },
    { key: 'p4Low', label: 'P4 Low (hrs)', type: 'number', required: true, min: 1 },
  ],
  6: [],
  7: [],
};

const DATA_STEP_FIELD_COUNT: Record<WizardStepId, number> = {
  1: 0, 2: 7, 3: 6, 4: 0, 5: 4, 6: 0, 7: 0,
};

export function validateField(rule: FieldRule, value: unknown): string | null {
  if (rule.type === 'checkbox') return null;
  const str = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);

  if (rule.required && !str) return `${rule.label} is required`;
  if (!str) return null;

  if (rule.type === 'email' && rule.pattern && !rule.pattern.test(str)) return 'Enter a valid email address';
  if (rule.type === 'url' && rule.pattern && !rule.pattern.test(str)) return 'Must start with http:// or https://';
  if (rule.type === 'number') {
    const n = Number(str);
    if (Number.isNaN(n)) return 'Must be a number';
    if (rule.min !== undefined && n < rule.min) return `Must be ≥ ${rule.min}`;
  }
  if (rule.exactLength && str.length !== rule.exactLength) return `Must be exactly ${rule.exactLength} characters`;
  if (rule.minLength && str.length < rule.minLength) return `Must be at least ${rule.minLength} characters`;
  if (rule.maxLength && str.length > rule.maxLength) return `Must be at most ${rule.maxLength} characters`;
  if (rule.pattern && rule.type === 'text' && !rule.pattern.test(str)) return 'Invalid format';

  return null;
}

export function validateStep(stepId: WizardStepId, data: Record<string, unknown>): Record<string, string> {
  const rules = STEP_FIELD_RULES[stepId] ?? [];
  const errors: Record<string, string> = {};
  for (const rule of rules) {
    const err = validateField(rule, data[rule.key]);
    if (err) errors[rule.key] = err;
  }
  return errors;
}

export function isStepValid(stepId: WizardStepId, data: Record<string, unknown>): boolean {
  return Object.keys(validateStep(stepId, data)).length === 0;
}

/**
 * Compute completion % ONLY over data-bearing steps (2, 3, 5).
 * Field-less steps (1, 4, 6, 7) are shown but never counted.
 */
export function computeCompletion(steps: { id: WizardStepId; state: string; data?: Record<string, unknown> }[]): number {
  const dataStepIds: WizardStepId[] = [2, 3, 5];
  let filled = 0;
  let total = 0;
  for (const sid of dataStepIds) {
    total += DATA_STEP_FIELD_COUNT[sid];
    const step = steps.find((s) => s.id === sid);
    if (!step) continue;
    const rules = STEP_FIELD_RULES[sid] ?? [];
    for (const rule of rules) {
      const val = step.data?.[rule.key];
      if (rule.type === 'checkbox') {
        if (val === true) filled++;
      } else if (rule.type === 'number') {
        if (val !== undefined && val !== null && val !== '' && !Number.isNaN(Number(val))) filled++;
      } else if (typeof val === 'string' && val.trim().length > 0) {
        filled++;
      }
    }
  }
  if (total === 0) return 0;
  return Math.round((filled / total) * 100);
}

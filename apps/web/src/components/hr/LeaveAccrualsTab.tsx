"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { toast } from "sonner";
import { Calculator, Play, CheckCircle, Plus, Pencil, X, CalendarDays } from "lucide-react";
import { LEAVE_TYPE_PICKER_OPTIONS, leaveTypeLabel } from "@/lib/leave-labels";

/**
 * Policy form state — one field per configurable column on `leave_policies`.
 * Defaults mirror the DB defaults (packages/db/src/schema/hr.ts:811-867) so an
 * untouched form creates exactly what the schema would.
 */
interface PolicyFormState {
  type: string;
  annualEntitlementDays: string;
  monthlyAccrualDays: string;   // "" = null (derive as annual/12)
  maxCarryForwardDays: string;
  encashable: boolean;
  yearEndTreatment: "forfeit" | "encash";
  exitTreatment: "encash_all" | "capped" | "accrued_only";
  encashmentBasis: "basic_da" | "gross";
  encashmentDivisor: 26 | 30;
  debitsBalance: boolean;
  expiryMode: "year_end" | "window_weeks";
  expiryWindowWeeks: string;    // "" = null
}

const EMPTY_POLICY_FORM: PolicyFormState = {
  type: "vacation",
  annualEntitlementDays: "0",
  monthlyAccrualDays: "",
  maxCarryForwardDays: "0",
  encashable: false,
  yearEndTreatment: "forfeit",
  exitTreatment: "encash_all",
  encashmentBasis: "basic_da",
  encashmentDivisor: 26,
  debitsBalance: true,
  expiryMode: "year_end",
  expiryWindowWeeks: "",
};

type PolicyRow = {
  id: string;
  type: string;
  annualEntitlementDays: string | number | null;
  monthlyAccrualDays: string | number | null;
  maxCarryForwardDays: string | number | null;
  encashable: boolean;
  yearEndTreatment?: string | null;
  exitTreatment?: string | null;
  encashmentBasis?: string | null;
  encashmentDivisor?: number | null;
  debitsBalance?: boolean | null;
  expiryMode?: string | null;
  expiryWindowWeeks?: number | null;
};

/**
 * The day columns are `decimal(5,1)`, so Postgres hands back "5.0" for 5. Editing
 * a policy should show the number the admin typed, not its storage form — and it
 * keeps the round-trip stable (open → save unchanged → same value).
 */
function decimalToInput(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
}

function formFromPolicy(p: PolicyRow): PolicyFormState {
  return {
    type: p.type,
    annualEntitlementDays: decimalToInput(p.annualEntitlementDays) || "0",
    monthlyAccrualDays: decimalToInput(p.monthlyAccrualDays),
    maxCarryForwardDays: decimalToInput(p.maxCarryForwardDays) || "0",
    encashable: !!p.encashable,
    yearEndTreatment: (p.yearEndTreatment as PolicyFormState["yearEndTreatment"]) ?? "forfeit",
    exitTreatment: (p.exitTreatment as PolicyFormState["exitTreatment"]) ?? "encash_all",
    encashmentBasis: (p.encashmentBasis as PolicyFormState["encashmentBasis"]) ?? "basic_da",
    encashmentDivisor: (p.encashmentDivisor === 30 ? 30 : 26),
    debitsBalance: p.debitsBalance ?? true,
    expiryMode: (p.expiryMode as PolicyFormState["expiryMode"]) ?? "year_end",
    expiryWindowWeeks: p.expiryWindowWeeks == null ? "" : String(p.expiryWindowWeeks),
  };
}

export function LeaveAccrualsTab() {
  const { can } = useRBAC();
  const utils = trpc.useUtils();
  
  const { data: policies, isLoading } = trpc.leaveAccrual.policy.list.useQuery();

  // ── Policy create / edit ───────────────────────────────────────────────────
  const canManagePolicies = can("hr", "approve");
  const [policyFormOpen, setPolicyFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState<PolicyFormState>(EMPTY_POLICY_FORM);
  /**
   * Server-side rejections (notably the 182-day Maternity Benefit Act floor) are
   * rendered ON the form and stay there. A toast would vanish before the user has
   * finished reading a statutory constraint they now need to act on.
   */
  const [policyError, setPolicyError] = useState<string | null>(null);

  const setField = <K extends keyof PolicyFormState>(key: K, value: PolicyFormState[K]) =>
    setPolicyForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setEditingId(null);
    setPolicyForm(EMPTY_POLICY_FORM);
    setPolicyError(null);
    setPolicyFormOpen(true);
  };

  const openEdit = (p: PolicyRow) => {
    setEditingId(p.id);
    setPolicyForm(formFromPolicy(p));
    setPolicyError(null);
    setPolicyFormOpen(true);
  };

  const upsertPolicy = trpc.leaveAccrual.policy.upsert.useMutation({
    onSuccess: async () => {
      setPolicyFormOpen(false);
      setPolicyError(null);
      toast.success(editingId ? "Leave policy updated." : "Leave policy created.");
      await utils.leaveAccrual.policy.list.invalidate();
    },
    onError: (e) => setPolicyError(e.message ?? "Failed to save leave policy"),
  });

  const submitPolicy = () => {
    setPolicyError(null);
    upsertPolicy.mutate({
      type: policyForm.type as never,
      annualEntitlementDays: Number(policyForm.annualEntitlementDays || 0),
      monthlyAccrualDays:
        policyForm.monthlyAccrualDays.trim() === "" ? null : Number(policyForm.monthlyAccrualDays),
      maxCarryForwardDays: Number(policyForm.maxCarryForwardDays || 0),
      encashable: policyForm.encashable,
      yearEndTreatment: policyForm.yearEndTreatment,
      exitTreatment: policyForm.exitTreatment,
      encashmentBasis: policyForm.encashmentBasis,
      encashmentDivisor: policyForm.encashmentDivisor,
      debitsBalance: policyForm.debitsBalance,
      expiryMode: policyForm.expiryMode,
      expiryWindowWeeks:
        policyForm.expiryWindowWeeks.trim() === "" ? null : Number(policyForm.expiryWindowWeeks),
    });
  };


  const [selectedType, setSelectedType] = useState<"vacation" | "sick" | "parental" | "bereavement" | "unpaid" | "other">("vacation");
  const [runYear, setRunYear] = useState(new Date().getFullYear());
  const [runMonth, setRunMonth] = useState(new Date().getMonth() || 12); // prior month

  const accrueAll = trpc.leaveAccrual.accrual.accrueAll.useMutation({
    onSuccess: (res) => {
      toast.success(`Accrued leave for ${res.accrued} employees.`);
    },
    onError: (e) => toast.error(e.message ?? "Failed to run accrual"),
  });

  const [closeEmpId, setCloseEmpId] = useState("");
  const closeRun = trpc.leaveAccrual.close.run.useMutation({
    onSuccess: () => {
      toast.success("Year closed for employee.");
    },
    onError: (e) => toast.error(e.message ?? "Failed to close year"),
  });

  const [encashEmpId, setEncashEmpId] = useState("");
  const [encashDays, setEncashDays] = useState(0);
  const encashRun = trpc.leaveAccrual.encash.run.useMutation({
    onSuccess: (res) => {
      toast.success(`Encashment processed: ₹${res.amount}`);
    },
    onError: (e) => toast.error(e.message ?? "Failed to process encashment"),
  });

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading policies...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Leave Policies & Accruals</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border rounded-md p-4">
          <h3 className="font-medium text-lg mb-4 flex items-center gap-2">
            <Calculator className="w-4 h-4" /> Run Monthly Accrual
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Leave Type</label>
              <select className="border rounded px-3 py-2 w-full bg-background" value={selectedType} onChange={(e) => setSelectedType(e.target.value as any)}>
                {LEAVE_TYPE_PICKER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Year</label>
                <input type="number" className="border rounded px-3 py-2 w-full bg-background" value={runYear} onChange={e => setRunYear(Number(e.target.value))} />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Month (1-12)</label>
                <input type="number" className="border rounded px-3 py-2 w-full bg-background" value={runMonth} onChange={e => setRunMonth(Number(e.target.value))} />
              </div>
            </div>
            <button
              onClick={() => accrueAll.mutate({ type: selectedType, year: runYear, month: runMonth })}
              disabled={accrueAll.isPending || !can("hr", "approve")}
              className="mt-2 w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {accrueAll.isPending ? "Running..." : "Run Global Accrual"} <Play className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-card border rounded-md p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-lg">Active Policies</h3>
            <button
              data-testid="new-policy-btn"
              onClick={openCreate}
              disabled={!canManagePolicies}
              title={canManagePolicies ? undefined : "Requires HR approve permission"}
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> New policy
            </button>
          </div>

          {policies?.length === 0 ? (
            <div
              data-testid="policy-empty-state"
              className="flex flex-col items-center text-center gap-2 border border-dashed rounded-md py-8 px-4"
            >
              <CalendarDays className="w-8 h-8 text-muted-foreground/60" />
              <p className="font-medium">No leave policies yet</p>
              <p className="text-muted-foreground text-sm max-w-sm">
                A leave policy sets, per leave type, how many days accrue each year, how much may be
                carried forward, whether the balance can be encashed, and what happens to it at
                year-end and on exit. Accrual runs and settlement read these rules — without one, no
                leave is credited.
              </p>
              <button
                data-testid="policy-empty-create-btn"
                onClick={openCreate}
                disabled={!canManagePolicies}
                className="mt-2 flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Create your first policy
              </button>
            </div>
          ) : (
            <div className="space-y-2" data-testid="policy-list">
              {(policies as PolicyRow[] | undefined)?.map(p => (
                <div
                  key={p.id}
                  data-testid={`policy-row-${p.type}`}
                  className="p-3 border rounded-md text-sm flex justify-between items-center bg-muted/30"
                >
                  <div>
                    <p className="font-semibold">{leaveTypeLabel(p.type)}</p>
                    <p className="text-muted-foreground" data-testid={`policy-entitlement-${p.type}`}>
                      Entitlement: {p.annualEntitlementDays} days/yr
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p>Cap: {p.maxCarryForwardDays} days</p>
                      <p>{p.encashable ? "Encashable" : "Non-encashable"}</p>
                    </div>
                    <button
                      data-testid={`policy-edit-${p.type}`}
                      onClick={() => openEdit(p)}
                      disabled={!canManagePolicies}
                      className="p-1.5 rounded border hover:bg-muted disabled:opacity-50"
                      aria-label={`Edit ${leaveTypeLabel(p.type)} policy`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border rounded-md p-4 space-y-4">
          <h3 className="font-medium text-lg">Year-End Close (Carry-Forward)</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Employee ID</label>
              <input type="text" className="border rounded px-3 py-2 w-full bg-background" value={closeEmpId} onChange={e => setCloseEmpId(e.target.value)} placeholder="UUID" />
            </div>
            <button
              onClick={() => closeRun.mutate({ employeeId: closeEmpId, type: selectedType, year: runYear })}
              disabled={closeRun.isPending || !closeEmpId || !can("hr", "approve")}
              className="w-full bg-secondary text-secondary-foreground py-2 rounded-md font-medium hover:bg-secondary/80 disabled:opacity-50"
            >
              {closeRun.isPending ? "Processing..." : "Run Close for Employee"}
            </button>
          </div>
        </div>

        <div className="bg-card border rounded-md p-4 space-y-4">
          <h3 className="font-medium text-lg">Leave Encashment</h3>
          <div className="space-y-3">
             <div>
              <label className="block text-sm font-medium mb-1">Employee ID</label>
              <input type="text" className="border rounded px-3 py-2 w-full bg-background" value={encashEmpId} onChange={e => setEncashEmpId(e.target.value)} placeholder="UUID" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Days to Encash</label>
              <input type="number" className="border rounded px-3 py-2 w-full bg-background" value={encashDays} onChange={e => setEncashDays(Number(e.target.value))} />
            </div>
            <button
              onClick={() => encashRun.mutate({ employeeId: encashEmpId, type: selectedType, days: encashDays, year: runYear })}
              disabled={encashRun.isPending || !encashEmpId || encashDays <= 0 || !can("hr", "approve")}
              className="w-full bg-secondary text-secondary-foreground py-2 rounded-md font-medium hover:bg-secondary/80 disabled:opacity-50"
            >
              {encashRun.isPending ? "Processing..." : "Process Encashment"}
            </button>
          </div>
        </div>
      </div>

      {policyFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            data-testid="policy-form-modal"
            className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">
                {editingId ? "Edit leave policy" : "New leave policy"}
              </h3>
              <button
                data-testid="policy-form-close"
                onClick={() => setPolicyFormOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {policyError && (
              <div
                data-testid="policy-form-error"
                role="alert"
                className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-700"
              >
                {policyError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="policy-type">Leave type</label>
                <select
                  id="policy-type"
                  data-testid="policy-type"
                  className="border rounded px-3 py-2 w-full bg-background disabled:opacity-60"
                  value={policyForm.type}
                  disabled={!!editingId}
                  onChange={(e) => setField("type", e.target.value)}
                >
                  {LEAVE_TYPE_PICKER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {editingId && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    One policy per leave type — the type cannot be changed on an existing policy.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="policy-annual">
                  Annual entitlement (days)
                </label>
                <input
                  id="policy-annual"
                  data-testid="policy-annual-entitlement"
                  type="number" min="0" step="0.5"
                  className="border rounded px-3 py-2 w-full bg-background"
                  value={policyForm.annualEntitlementDays}
                  onChange={(e) => setField("annualEntitlementDays", e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Maternity has a statutory floor of 182 days (26 weeks).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="policy-monthly">
                  Monthly accrual (days)
                </label>
                <input
                  id="policy-monthly"
                  data-testid="policy-monthly-accrual"
                  type="number" min="0" step="0.5"
                  placeholder="Blank = annual ÷ 12"
                  className="border rounded px-3 py-2 w-full bg-background"
                  value={policyForm.monthlyAccrualDays}
                  onChange={(e) => setField("monthlyAccrualDays", e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="policy-carry">
                  Max carry-forward (days)
                </label>
                <input
                  id="policy-carry"
                  data-testid="policy-max-carry-forward"
                  type="number" min="0" step="0.5"
                  className="border rounded px-3 py-2 w-full bg-background"
                  value={policyForm.maxCarryForwardDays}
                  onChange={(e) => setField("maxCarryForwardDays", e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="policy-year-end">
                  Year-end treatment (balance above the cap)
                </label>
                <select
                  id="policy-year-end"
                  data-testid="policy-year-end-treatment"
                  className="border rounded px-3 py-2 w-full bg-background"
                  value={policyForm.yearEndTreatment}
                  onChange={(e) => setField("yearEndTreatment", e.target.value as PolicyFormState["yearEndTreatment"])}
                >
                  <option value="forfeit">Forfeit</option>
                  <option value="encash">Encash</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="policy-exit">
                  Exit treatment (on offboarding)
                </label>
                <select
                  id="policy-exit"
                  data-testid="policy-exit-treatment"
                  className="border rounded px-3 py-2 w-full bg-background"
                  value={policyForm.exitTreatment}
                  onChange={(e) => setField("exitTreatment", e.target.value as PolicyFormState["exitTreatment"])}
                >
                  <option value="encash_all">Encash the whole balance</option>
                  <option value="capped">Encash up to the cap</option>
                  <option value="accrued_only">Encash accrued only</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="policy-basis">
                  Encashment wage basis
                </label>
                <select
                  id="policy-basis"
                  data-testid="policy-encashment-basis"
                  className="border rounded px-3 py-2 w-full bg-background"
                  value={policyForm.encashmentBasis}
                  onChange={(e) => setField("encashmentBasis", e.target.value as PolicyFormState["encashmentBasis"])}
                >
                  <option value="basic_da">Basic + DA</option>
                  <option value="gross">Gross</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="policy-divisor">
                  Per-day divisor
                </label>
                <select
                  id="policy-divisor"
                  data-testid="policy-encashment-divisor"
                  className="border rounded px-3 py-2 w-full bg-background"
                  value={String(policyForm.encashmentDivisor)}
                  onChange={(e) => setField("encashmentDivisor", Number(e.target.value) === 30 ? 30 : 26)}
                >
                  <option value="26">26 (wage ÷ 26)</option>
                  <option value="30">30 (wage ÷ 30, CCS convention)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="policy-expiry-mode">
                  Balance expiry
                </label>
                <select
                  id="policy-expiry-mode"
                  data-testid="policy-expiry-mode"
                  className="border rounded px-3 py-2 w-full bg-background"
                  value={policyForm.expiryMode}
                  onChange={(e) => setField("expiryMode", e.target.value as PolicyFormState["expiryMode"])}
                >
                  <option value="year_end">At year-end</option>
                  <option value="window_weeks">Rolling window (weeks)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="policy-expiry-weeks">
                  Expiry window (weeks)
                </label>
                <input
                  id="policy-expiry-weeks"
                  data-testid="policy-expiry-window-weeks"
                  type="number" min="1" max="52" step="1"
                  placeholder="Only for a rolling window"
                  disabled={policyForm.expiryMode !== "window_weeks"}
                  className="border rounded px-3 py-2 w-full bg-background disabled:opacity-60"
                  value={policyForm.expiryWindowWeeks}
                  onChange={(e) => setField("expiryWindowWeeks", e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="policy-encashable"
                  data-testid="policy-encashable"
                  type="checkbox"
                  className="rounded"
                  checked={policyForm.encashable}
                  onChange={(e) => setField("encashable", e.target.checked)}
                />
                <label htmlFor="policy-encashable" className="text-sm font-medium">Encashable</label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="policy-debits-balance"
                  data-testid="policy-debits-balance"
                  type="checkbox"
                  className="rounded"
                  checked={policyForm.debitsBalance}
                  onChange={(e) => setField("debitsBalance", e.target.checked)}
                />
                <label htmlFor="policy-debits-balance" className="text-sm font-medium">
                  Taking this leave debits the balance
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setPolicyFormOpen(false)}
                className="px-3 py-1.5 rounded border text-[12px] hover:bg-muted"
              >
                Cancel
              </button>
              <button
                data-testid="policy-save-btn"
                onClick={submitPolicy}
                disabled={upsertPolicy.isPending}
                className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {upsertPolicy.isPending ? "Saving…" : editingId ? "Save changes" : "Create policy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

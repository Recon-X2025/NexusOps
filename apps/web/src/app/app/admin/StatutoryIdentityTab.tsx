"use client";

/**
 * Organisation → Statutory Identity.
 *
 * The post-onboarding editor for the India statutory identifiers payroll step 13 needs
 * (EPF code, ESI establishment number, PT registration number, PF contribution rate). The
 * onboarding wizard goes read-only once complete and never offered PT reg or PF rate, so
 * before this screen a completed-onboarding tenant could not reach a statutory output at all.
 * Reads `onboarding.getWizardData`, writes `onboarding.updateStatutoryIdentity`.
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const REDUCED_RATE_REASONS = [
  { value: "bidi", label: "Bidi" },
  { value: "brick", label: "Brick" },
  { value: "coir", label: "Coir" },
  { value: "jute", label: "Jute" },
  { value: "guar_gum", label: "Guar Gum" },
  { value: "under_20_employees", label: "Fewer than 20 employees" },
  { value: "sick_establishment", label: "Sick establishment" },
] as const;

type ReducedReason = (typeof REDUCED_RATE_REASONS)[number]["value"];

export function StatutoryIdentityTab() {
  const utils = trpc.useUtils();
  const wizard = trpc.onboarding.getWizardData.useQuery(undefined, { refetchOnWindowFocus: false });

  const [epfCode, setEpfCode] = useState("");
  const [esi, setEsi] = useState("");
  const [ptReg, setPtReg] = useState("");
  const [pfRate, setPfRate] = useState<"12" | "10">("12");
  const [reason, setReason] = useState<ReducedReason | "">("");

  // Seed the form from the persisted values once loaded.
  useEffect(() => {
    const india = wizard.data?.india;
    if (!india) return;
    setEpfCode(india.pf ?? "");
    setEsi(india.esi ?? "");
    setPtReg(india.ptRegistrationNumber ?? "");
    setPfRate(Number(india.pfContributionRate ?? 12) < 12 ? "10" : "12");
    setReason((india.pfReducedRateReason as ReducedReason | null) ?? "");
  }, [wizard.data]);

  const save = trpc.onboarding.updateStatutoryIdentity.useMutation({
    onSuccess: () => {
      toast.success("Statutory identity saved");
      utils.onboarding.getWizardData.invalidate();
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? "Could not save"),
  });

  const reducedNeedsReason = pfRate === "10" && !reason;

  const inputCls =
    "w-full mt-1 text-body-sm border border-border rounded-lg px-3 py-2 bg-background font-mono";

  if (wizard.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-body-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-4">
        <h2 className="text-body-lg font-semibold text-foreground">Statutory Identity</h2>
        <p className="text-body-sm text-muted-foreground mt-1">
          The organisation&rsquo;s India statutory registration numbers. Payroll refuses to generate an
          EPF ECR, ESI challan or PT challan without the matching identifier here.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (reducedNeedsReason) {
            toast.error("A reduced (10%) PF rate requires a reason.");
            return;
          }
          save.mutate({
            epfCode: epfCode.trim(),
            esiEstablishmentNumber: esi.trim(),
            ptRegistrationNumber: ptReg.trim(),
            pfContributionRate: pfRate === "10" ? 10 : 12,
            pfReducedRateReason: pfRate === "10" ? (reason as ReducedReason) : null,
          });
        }}
      >
        <label className="block">
          <span className="text-caption font-medium text-muted-foreground">EPF establishment code</span>
          <input className={inputCls} value={epfCode} onChange={(e) => setEpfCode(e.target.value)} placeholder="KA/BNG/12345/000/0001" />
        </label>

        <label className="block">
          <span className="text-caption font-medium text-muted-foreground">ESI establishment number</span>
          <input className={inputCls} value={esi} onChange={(e) => setEsi(e.target.value)} placeholder="12000123450000999" />
          <span className="text-[10px] text-muted-foreground/70">Leave blank if not ESI-registered (registration triggers at 10+ employees).</span>
        </label>

        <label className="block">
          <span className="text-caption font-medium text-muted-foreground">Professional-tax registration number</span>
          <input className={inputCls} value={ptReg} onChange={(e) => setPtReg(e.target.value)} placeholder="PT-KA-99999" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-caption font-medium text-muted-foreground">PF contribution rate</span>
            <select
              className={inputCls}
              value={pfRate}
              onChange={(e) => {
                const v = e.target.value as "12" | "10";
                setPfRate(v);
                if (v === "12") setReason("");
              }}
            >
              <option value="12">12% (standard)</option>
              <option value="10">10% (reduced)</option>
            </select>
          </label>

          {pfRate === "10" && (
            <label className="block">
              <span className="text-caption font-medium text-muted-foreground">Reason for reduced rate</span>
              <select
                className={inputCls}
                value={reason}
                onChange={(e) => setReason(e.target.value as ReducedReason | "")}
              >
                <option value="">Select a reason…</option>
                {REDUCED_RATE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {pfRate === "10" && (
          <p className="text-[11px] text-muted-foreground">
            The reduced 10% rate applies to both employee and employer sides for every employee under this
            registration. The reason is the EPFO ground carried on the ECR upload.
          </p>
        )}

        {save.error && <div className="text-body-sm text-red-600">{save.error.message}</div>}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={save.isPending || reducedNeedsReason}
            className="px-4 py-2 text-body-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save statutory identity"}
          </button>
          {reducedNeedsReason && (
            <span className="text-[11px] text-amber-600 dark:text-amber-500">Select a reason for the reduced rate.</span>
          )}
        </div>
      </form>
    </div>
  );
}

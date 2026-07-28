"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { toast } from "sonner";
import { Calculator, Play, CheckCircle } from "lucide-react";

export function LeaveAccrualsTab() {
  const { can } = useRBAC();
  const utils = trpc.useUtils();
  
  const { data: policies, isLoading } = trpc.leaveAccrual.policy.list.useQuery();
  
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
                <option value="vacation">Vacation</option>
                <option value="sick">Sick</option>
                <option value="parental">Parental</option>
                <option value="bereavement">Bereavement</option>
                <option value="unpaid">Unpaid</option>
                <option value="other">Other</option>
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
          <h3 className="font-medium text-lg mb-4">Active Policies</h3>
          {policies?.length === 0 ? (
            <p className="text-muted-foreground text-sm">No leave policies defined.</p>
          ) : (
            <div className="space-y-2">
              {policies?.map(p => (
                <div key={p.id} className="p-3 border rounded-md text-sm flex justify-between items-center bg-muted/30">
                  <div>
                    <p className="font-semibold capitalize">{p.type}</p>
                    <p className="text-muted-foreground">Entitlement: {p.annualEntitlementDays} days/yr</p>
                  </div>
                  <div className="text-right">
                    <p>Cap: {p.maxCarryForwardDays} days</p>
                    <p>{p.encashable ? "Encashable" : "Non-encashable"}</p>
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
    </div>
  );
}

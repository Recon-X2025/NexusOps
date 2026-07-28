"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { toast } from "sonner";
import { Banknote, Play } from "lucide-react";

export function GratuityTab() {
  const { can } = useRBAC();
  
  const [runYear, setRunYear] = useState(new Date().getFullYear());
  const [runMonth, setRunMonth] = useState(new Date().getMonth() || 12); // prior month
  
  const provisionAll = trpc.gratuity.accrual.provisionAll.useMutation({
    onSuccess: (res) => {
      toast.success(`Provisioned gratuity for ${res.provisioned} employees (₹${res.totalAccrued}).`);
    },
    onError: (e) => toast.error(e.message ?? "Failed to provision gratuity"),
  });

  const [settleEmpId, setSettleEmpId] = useState("");
  const settleRun = trpc.gratuity.settlement.settle.useMutation({
    onSuccess: (res) => {
      toast.success(`Gratuity settled: ₹${res.gratuityAmount}`);
    },
    onError: (e) => toast.error(e.message ?? "Failed to settle gratuity"),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Gratuity Management</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border rounded-md p-4 space-y-4">
          <h3 className="font-medium text-lg flex items-center gap-2">
            <Banknote className="w-4 h-4" /> Run Monthly Provisioning
          </h3>
          <p className="text-sm text-muted-foreground">
            Calculate and provision trailing gratuity liabilities for all active employees. This process runs automatically via cron, but can be manually triggered here.
          </p>
          <div className="space-y-3">
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
              onClick={() => provisionAll.mutate({ year: runYear, month: runMonth })}
              disabled={provisionAll.isPending || !can("hr", "approve")}
              className="mt-2 w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {provisionAll.isPending ? "Running..." : "Run Global Provision"} <Play className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-card border rounded-md p-4 space-y-4">
          <h3 className="font-medium text-lg">Gratuity Settlement (Exit)</h3>
          <p className="text-sm text-muted-foreground">
            Settle gratuity for a departing employee. Ensures they meet the minimum service requirement unless waived.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Employee ID</label>
              <input type="text" className="border rounded px-3 py-2 w-full bg-background" value={settleEmpId} onChange={e => setSettleEmpId(e.target.value)} placeholder="UUID" />
            </div>
            <button
              onClick={() => settleRun.mutate({ employeeId: settleEmpId, asOf: new Date().toISOString() })}
              disabled={settleRun.isPending || !settleEmpId || !can("hr", "approve")}
              className="w-full bg-secondary text-secondary-foreground py-2 rounded-md font-medium hover:bg-secondary/80 disabled:opacity-50"
            >
              {settleRun.isPending ? "Processing..." : "Process Settlement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

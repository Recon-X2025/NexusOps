"use client";

import { useState } from "react";
import { CheckSquare, Square, ChevronDown, ChevronRight } from "lucide-react";

interface Step {
  id: string;
  label: string;
  note: string;
  done: boolean;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  steps: Step[];
}

const INITIAL_PLAYBOOKS: Playbook[] = [
  {
    id: "enterprise-onboarding",
    name: "New Enterprise Org Onboarding",
    description: "Steps to provision and onboard a new enterprise customer",
    steps: [
      { id: "1", label: "Provision org in MAC", note: "", done: false },
      { id: "2", label: "Configure SSO (SAML/OIDC)", note: "", done: false },
      { id: "3", label: "Set feature flags (SSO, AI, branding)", note: "", done: false },
      { id: "4", label: "Schedule kick-off call with admin", note: "", done: false },
      { id: "5", label: "Add to internal Slack channel", note: "", done: false },
    ],
  },
  {
    id: "trial-conversion",
    name: "Trial Conversion",
    description: "Convert a trialing org to a paid plan",
    steps: [
      { id: "1", label: "Review feature flag usage", note: "", done: false },
      { id: "2", label: "Review ticket volume and activity", note: "", done: false },
      { id: "3", label: "Upgrade plan in billing tab", note: "", done: false },
      { id: "4", label: "Disable trial flag in settings", note: "", done: false },
    ],
  },
  {
    id: "offboarding",
    name: "Org Offboarding",
    description: "Safely offboard an organization from the platform",
    steps: [
      { id: "1", label: "Export org data", note: "", done: false },
      { id: "2", label: "Notify org admin via email", note: "", done: false },
      { id: "3", label: "Suspend org in Organizations tab", note: "", done: false },
      { id: "4", label: "Schedule data deletion (30-day grace)", note: "", done: false },
    ],
  },
];

function PlaybookCard({ playbook: initial }: { playbook: Playbook }) {
  const [playbook, setPlaybook] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const done = playbook.steps.filter((s) => s.done).length;
  const total = playbook.steps.length;
  const pct = Math.round((done / total) * 100);

  function toggleStep(id: string) {
    setPlaybook((p) => ({ ...p, steps: p.steps.map((s) => s.id === id ? { ...s, done: !s.done } : s) }));
  }

  function updateNote(id: string, note: string) {
    setPlaybook((p) => ({ ...p, steps: p.steps.map((s) => s.id === id ? { ...s, note } : s) }));
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 text-left"
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800">{playbook.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{playbook.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-slate-500">{done}/{total}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {playbook.steps.map((step) => (
            <div key={step.id} className="px-5 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <button onClick={() => toggleStep(step.id)} className={step.done ? "text-indigo-500" : "text-slate-300 hover:text-slate-500"}>
                  {step.done ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
                <span className={`text-sm ${step.done ? "line-through text-slate-400" : "text-slate-800"}`}>{step.label}</span>
                <button
                  onClick={() => setEditingNote(editingNote === step.id ? null : step.id)}
                  className="ml-auto text-xs text-slate-400 hover:text-indigo-600"
                >
                  {step.note ? "Edit note" : "+ Add note"}
                </button>
              </div>
              {(editingNote === step.id || step.note) && (
                <input
                  value={step.note}
                  onChange={(e) => updateNote(step.id, e.target.value)}
                  onBlur={() => setEditingNote(null)}
                  autoFocus={editingNote === step.id}
                  placeholder="Add a note…"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-indigo-400 focus:outline-none ml-7"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlaybooksPage() {
  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Playbooks</h1>
        <p className="text-sm text-slate-500">Operator checklists for common MAC workflows</p>
      </div>
      <div className="space-y-3">
        {INITIAL_PLAYBOOKS.map((pb) => <PlaybookCard key={pb.id} playbook={pb} />)}
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Bot, Send, Loader2, ChevronDown, ChevronRight } from "lucide-react";

/**
 * CopilotPanel — talks to ai.agentInvoke (tool-calling agent).
 *
 * UX rules (locked):
 *   - Lead with the answer; trace appears collapsed below.
 *   - Tool-call trace is mandatory in the UI so users can see grounding.
 *   - When the agent returns no useful answer, surface the trace as the
 *     primary signal so users can refine the question.
 *   - Read-only first release. The footer reminds users that mutations are
 *     coming in the next release.
 */

interface CopilotTrace {
  toolName?: string;
  args?: Record<string, unknown>;
  resultPreview?: string;
  ms?: number;
}

interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: CopilotTrace[];
}

const SUGGESTIONS = [
  "Show me my open P1 tickets",
  "Contracts expiring in the next 60 days",
  "What's due this month for compliance?",
  "Last month's payslip for me",
  "Unpaid invoices over 30 days",
];

export function CopilotPanel({ className = "" }: { className?: string }) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [openTrace, setOpenTrace] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const invoke = trpc.ai.agentInvoke.useMutation();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, invoke.isPending]);

  const send = async (q: string) => {
    if (!q.trim() || invoke.isPending) return;
    const userMsg: CopilotMessage = { id: crypto.randomUUID(), role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
    try {
      const res = await invoke.mutateAsync({ question: q, conversationHistory: history });
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.answer,
          trace: res.trace,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${(e as Error).message}`,
        },
      ]);
    }
  };

  return (
    <div
      className={`flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm h-full ${className}`}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <Bot className="w-5 h-5 text-slate-600" />
        <div className="font-semibold text-sm text-slate-900">NexusOps Copilot</div>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400 px-2 py-0.5 bg-slate-100 rounded">
          Read-only · v1
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-slate-500 space-y-2">
            <p>Ask anything across tickets, HR, finance, contracts, or compliance.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-2.5 py-1 rounded-full text-xs bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] px-3 py-2 rounded-lg bg-slate-900 text-white text-sm"
                  : "max-w-[90%] px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-900"
              }
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.trace && m.trace.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <button
                    onClick={() => setOpenTrace((p) => ({ ...p, [m.id]: !p[m.id] }))}
                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
                  >
                    {openTrace[m.id] ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    {m.trace.length} tool call{m.trace.length === 1 ? "" : "s"}
                  </button>
                  {openTrace[m.id] && (
                    <div className="mt-2 space-y-1.5">
                      {m.trace.map((t, idx) => (
                        <div
                          key={idx}
                          className="text-[11px] font-mono bg-white border border-slate-200 rounded px-2 py-1"
                        >
                          <div className="text-slate-700">
                            <span className="text-blue-700">{t.toolName}</span>(
                            {JSON.stringify(t.args)}) <span className="text-slate-400">· {t.ms}ms</span>
                          </div>
                          <div className="text-slate-500 truncate">→ {t.resultPreview}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {invoke.isPending && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Thinking…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-slate-100 px-3 py-2 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot…"
          disabled={invoke.isPending}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={invoke.isPending || !input.trim()}
          className="p-2 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      <div className="px-3 pb-2 text-[10px] text-slate-400">
        Read-only. Mutating actions (create, approve, send) ship in v1.1 with confirmation.
      </div>
    </div>
  );
}

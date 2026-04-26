"use client";

import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import { usePathname } from "next/navigation";
import { X, Send, Minimize2, Maximize2, Bot, RefreshCw, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface CopilotTrace {
  toolName?: string;
  args?: Record<string, unknown>;
  resultPreview?: string;
  ms?: number;
}

interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
  time: string;
  suggestions?: string[];
  action?: { label: string; href: string };
  trace?: CopilotTrace[];
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "m0",
    role: "assistant",
    content:
      "Hi! I'm the **NexusOps Copilot** — grounded in your live tenant data.\n\nI can search your tickets, KB, employees, payslips, invoices, contracts, and statutory calendar — and tell you exactly which tool I used to answer.\n\nWhat would you like to know?",
    time: "Now",
    suggestions: [
      "Show open P1 incidents",
      "How many invoices are overdue?",
      "What's due in the GST calendar this month?",
      "Find contracts expiring in 30 days",
    ],
  },
];

const ROUTE_CONTEXT: Record<string, { label: string; suggestions: string[] }> = {
  "/app/tickets":           { label: "Service Desk", suggestions: ["Create a P2 incident", "Check my open tickets", "Show SLA breaches", "Assign ticket to team"] },
  "/app/changes":           { label: "Change Management", suggestions: ["Create a change request", "Show upcoming changes", "Check CAB schedule", "Review pending changes"] },
  "/app/problems":          { label: "Problem Management", suggestions: ["Open problem record", "Show known errors", "Link incidents to problem", "Review problem backlog"] },
  "/app/cmdb":              { label: "CMDB", suggestions: ["Add new CI", "Search configuration items", "Show CI dependencies", "Audit recent changes"] },
  "/app/ham":               { label: "Hardware Assets", suggestions: ["Check out an asset", "Register new hardware", "Show assets due for refresh", "View asset lifecycle"] },
  "/app/sam":               { label: "Software Assets", suggestions: ["Show license utilization", "Find unused licenses", "Check software expiries", "Add software record"] },
  "/app/approvals":         { label: "Approvals", suggestions: ["Show pending approvals", "Approve selected items", "Delegate my approvals", "View approval history"] },
  "/app/hr":                { label: "HR Service Delivery", suggestions: ["Create HR case", "Check leave balance", "Start onboarding checklist", "View employee directory"] },
  "/app/recruitment":       { label: "Recruitment", suggestions: ["Open job requisitions", "Review candidates", "Schedule interview", "Check pipeline status"] },
  "/app/crm":               { label: "CRM & Sales", suggestions: ["Add new deal", "Check pipeline value", "Log a call activity", "View accounts at risk"] },
  "/app/procurement":       { label: "Procurement", suggestions: ["Create purchase request", "Approve pending POs", "Check vendor list", "Track open orders"] },
  "/app/contracts":         { label: "Contracts", suggestions: ["Show expiring contracts", "Add new contract", "Check obligation due dates", "Find contract by counterparty"] },
  "/app/hr/expenses":       { label: "My Expense Claims", suggestions: ["File a new expense claim", "Submit my draft", "Check approval status", "View my expense history"] },
  "/app/finance/expenses":  { label: "Expense Approver Queue", suggestions: ["Show pending approvals", "Mark as reimbursed", "Reject with reason", "Export approved claims for payroll"] },
  "/app/performance":       { label: "Performance Management", suggestions: ["Create review cycle", "Add a goal or OKR", "Check my review status", "View team goals progress"] },
  "/app/security":          { label: "Security Operations", suggestions: ["Show open security incidents", "Check vulnerability status", "Review high risk items", "Escalate security alert"] },
  "/app/grc":               { label: "GRC", suggestions: ["Check compliance status", "View risk register", "Schedule audit", "Review policy attestations"] },
  "/app/strategy":          { label: "Strategy Center", suggestions: ["Show at-risk initiatives", "Which projects are off-track?", "OKR progress this quarter", "Top 3 dependencies blocking us"] },
  "/app/projects":          { label: "Initiatives", suggestions: ["Show at-risk projects", "View project milestones", "Add project update", "Which initiative owns the largest budget?"] },
  "/app/knowledge":         { label: "Knowledge Base", suggestions: ["Search knowledge articles", "Create new article", "Show recently updated articles", "Find troubleshooting guides"] },
  "/app/reports":           { label: "Analytics", suggestions: ["Generate ITSM report", "Show SLA compliance trend", "Export ticket metrics", "View executive dashboard"] },
  "/app/catalog":           { label: "Service Catalog", suggestions: ["Browse available services", "Check my requests", "Request software access", "Order hardware"] },
};

function getPageContext(pathname: string) {
  for (const [route, ctx] of Object.entries(ROUTE_CONTEXT)) {
    if (pathname.startsWith(route)) return ctx;
  }
  return null;
}

/**
 * Suggestion chips per route — purely presentational. Every chip click sends
 * the chip text to the live AI Copilot agent.
 */

export function VirtualAgentWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Inject a context hint message whenever the user navigates to a new module
  const prevPathnameRef = useRef<string>("");
  useEffect(() => {
    if (!open) return;
    const ctx = getPageContext(pathname);
    if (!ctx || pathname === prevPathnameRef.current) return;
    prevPathnameRef.current = pathname;
    setMessages((prev) => [
      ...prev,
      {
        id: `ctx-${Date.now()}`,
        role: "assistant",
        content: `I can see you're in **${ctx.label}**. Here are some things I can help you with:`,
        time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        suggestions: ctx.suggestions,
      },
    ]);
  }, [pathname, open]);

  useEffect(() => {
    if (open && !minimised) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, minimised]);

  const addMessage = (content: string, isUser: boolean, meta?: Partial<Message>) => {
    const msg: Message = {
      id: Date.now().toString(),
      role: isUser ? "user" : "assistant",
      content,
      time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      ...meta,
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  const agentInvoke = trpc.ai.agentInvoke.useMutation();

  const handleSend = (text: string) => {
    if (!text.trim() || isTyping) return;
    addMessage(text, true);
    setInput("");
    setIsTyping(true);

    agentInvoke.mutate(
      { question: text },
      {
        onSuccess: (res) => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              content: res.answer,
              time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
              ...(Array.isArray(res.trace) && res.trace.length > 0 ? { trace: res.trace as CopilotTrace[] } : {}),
            },
          ]);
        },
        onError: (err) => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              content: `I couldn't answer that — ${err.message ?? "unknown error"}. Try a more specific question.`,
              time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
        },
      },
    );
  };

  const renderContent = (text: string) => {
    return text.split("\n").map((line, i) => {
      const boldLine = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      return (
        <span key={i} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(boldLine + (i < text.split("\n").length - 1 ? "<br/>" : "")) }} />
      );
    });
  };

  return (
    <>
      {/* Floating button — z-30 keeps it below modals/dropdowns (z-50) but above content */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 w-10 h-10 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center justify-center z-30 group"
          title="NexusOps Virtual Agent"
        >
          <Bot className="w-4 h-4" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-background" />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className={`fixed bottom-6 right-6 z-30 flex flex-col rounded-xl shadow-2xl border border-border bg-card text-card-foreground overflow-hidden transition-all ${minimised ? "w-72 h-12" : "w-80 h-[480px]"}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-primary text-white flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[12px] font-semibold leading-none">NexusOps Assistant</p>
                <p className="text-[10px] text-white/70 leading-none mt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1" />
                  Online · AI-powered
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMessages(INITIAL_MESSAGES)} className="p-1 hover:bg-white/10 rounded" title="Reset">
                <RefreshCw className="w-3 h-3" />
              </button>
              <button onClick={() => setMinimised(!minimised)} className="p-1 hover:bg-white/10 rounded">
                {minimised ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              </button>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/10 rounded">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {!minimised && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-3 h-3" />
                      </div>
                    )}
                    <div className={`flex flex-col gap-1 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <div className={`px-3 py-2 rounded-xl text-[12px] leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-none" : "bg-muted text-foreground rounded-bl-none"}`}>
                        {renderContent(msg.content)}
                      </div>
                      {msg.action && (
                        <a href={msg.action.href}
                          className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1">
                          {msg.action.label}
                        </a>
                      )}
                      {msg.suggestions && msg.role === "assistant" && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {msg.suggestions.map((s) => (
                            <button key={s} onClick={() => handleSend(s)}
                              className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full hover:bg-primary/15 dark:bg-primary/20 dark:border-primary/30 transition-colors">
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      {msg.trace && msg.trace.length > 0 && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-muted-foreground/70 cursor-pointer flex items-center gap-1 hover:text-muted-foreground">
                            <ChevronDown className="w-3 h-3" />
                            {msg.trace.length} tool call{msg.trace.length > 1 ? "s" : ""}
                          </summary>
                          <div className="mt-1 space-y-1">
                            {msg.trace.map((t, i) => (
                              <div
                                key={i}
                                className="text-[10px] border border-border bg-muted/30 rounded px-2 py-1"
                              >
                                <div className="font-mono text-foreground/80">
                                  {t.toolName ?? "tool"}
                                  {typeof t.ms === "number" ? ` · ${t.ms}ms` : ""}
                                </div>
                                {t.resultPreview && (
                                  <div className="text-muted-foreground truncate">{t.resultPreview}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3 h-3" />
                    </div>
                    <div className="px-3 py-2 bg-muted rounded-xl rounded-bl-none flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border bg-card flex-shrink-0">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend(input)}
                  placeholder="Ask me anything..."
                  className="flex-1 text-[12px] outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
                />
                <button
                  onClick={() => handleSend(input)}
                  disabled={!input.trim() || isTyping}
                  className="p-1.5 rounded-full bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

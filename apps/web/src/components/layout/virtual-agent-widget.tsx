"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Minimize2, Maximize2, Bot, Zap, ChevronDown, RefreshCw } from "lucide-react";

interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
  time: string;
  suggestions?: string[];
  action?: { label: string; href: string };
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "m0",
    role: "assistant",
    content: "Hi! I'm **NexusOps Assistant** — powered by AI. I can help you:\n\n• Create tickets, requests, and work orders\n• Find knowledge articles\n• Check SLA status\n• Escalate incidents\n• Answer questions about any module\n\nWhat can I help you with today?",
    time: "Now",
    suggestions: ["Create a P2 incident", "Check my open tickets", "Request software access", "Show SLA breaches"],
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
  "/app/expenses":          { label: "Expense Management", suggestions: ["Create expense report", "Submit pending report", "Check approval status", "View my expense history"] },
  "/app/performance":       { label: "Performance Management", suggestions: ["Create review cycle", "Add a goal or OKR", "Check my review status", "View team goals progress"] },
  "/app/security":          { label: "Security Operations", suggestions: ["Show open security incidents", "Check vulnerability status", "Review high risk items", "Escalate security alert"] },
  "/app/grc":               { label: "GRC", suggestions: ["Check compliance status", "View risk register", "Schedule audit", "Review policy attestations"] },
  "/app/projects":          { label: "Project Portfolio", suggestions: ["Show at-risk projects", "Check resource allocation", "View project milestones", "Add project update"] },
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
  "Create a P2 incident": {
    id: "r1", role: "assistant",
    content: "I'll help you create a P2 incident. Can you provide:\n\n1. **Short description** of the issue\n2. **Affected system** or service\n3. **Impact** — how many users affected?\n\nOr I can open the incident form for you.",
    time: "Now",
    suggestions: ["Open incident form", "Auto-fill from template", "Assign to Service Desk"],
    action: { label: "Open New Incident Form →", href: "/app/tickets/new" },
  },
  "Check my open tickets": {
    id: "r2", role: "assistant",
    content: "You have **12 open incidents** in your queue:\n\n• **4 P1/P2** — require immediate attention\n• **6 P3** — within SLA\n• **2 P4** — informational\n\nNewest: **COHE-0041** — Payment portal SQL injection (CRITICAL, SLA breached)\n\nWould you like me to filter by priority?",
    time: "Now",
    suggestions: ["Show P1/P2 only", "Show SLA breached", "Assign to colleague", "View all tickets"],
    action: { label: "View All Tickets →", href: "/app/tickets" },
  },
  "Request software access": {
    id: "r3", role: "assistant",
    content: "I can raise a software access request for you. Which application do you need access to?\n\nCommon requests:\n• **GitHub** (dev team)\n• **Jira** (project management)\n• **Confluence** (knowledge)\n• **AWS Console** (needs approvals)\n• Other — type the name",
    time: "Now",
    suggestions: ["GitHub access", "Jira + Confluence", "AWS Console", "Adobe Creative Cloud"],
    action: { label: "Browse Service Catalog →", href: "/app/catalog" },
  },
  "Show SLA breaches": {
    id: "r4", role: "assistant",
    content: "**Current SLA Breaches** — 3 active:\n\n🔴 **COHE-0041** — P1 Incident (4h 28m overdue) · Dana Kim\n🟠 **COHE-0038** — P2 Incident (48m overdue) · Jordan Chen\n🟡 **SR-0284** — Service Request (2h overdue) · Pat Murphy\n\nI've notified the respective owners. Want me to escalate any of these?",
    time: "Now",
    suggestions: ["Escalate COHE-0041", "Escalate all breaches", "Notify managers", "View escalation queue"],
    action: { label: "View Escalation Queue →", href: "/app/escalations" },
  },
  default: {
    id: "rd", role: "assistant",
    content: "I'm processing your request... For complex queries, I can search the knowledge base or connect you to a live agent. Could you provide more details so I can assist you better?",
    time: "Now",
    suggestions: ["Search knowledge base", "Connect to live agent", "Create a ticket for this", "Cancel"],
  },
};

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

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    addMessage(text, true);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const response = BOT_RESPONSES[text] ?? {
        ...BOT_RESPONSES.default,
        id: Date.now().toString(),
        content: `I understand you're asking about "${text}". Let me search the knowledge base and connected systems for relevant information.\n\nI found **3 related articles** and **1 open incident** that might be relevant. Would you like me to summarise them?`,
        suggestions: ["Show knowledge articles", "View related incidents", "Create a ticket", "Connect to live agent"],
      };
      setMessages((prev) => [
        ...prev,
        {
          ...response,
          id: Date.now().toString(),
          time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          role: "assistant" as const,
        },
      ]);
    }, 900 + Math.random() * 600);
  };

  const renderContent = (text: string) => {
    return text.split("\n").map((line, i) => {
      const boldLine = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      return (
        <span key={i} dangerouslySetInnerHTML={{ __html: boldLine + (i < text.split("\n").length - 1 ? "<br/>" : "") }} />
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

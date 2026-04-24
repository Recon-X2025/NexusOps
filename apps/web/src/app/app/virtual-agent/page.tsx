"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, RefreshCw, User, Zap, BookOpen, Wrench, TicketIcon, ChevronRight, ThumbsUp, ThumbsDown, X, Maximize2 } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";

type Message = {
  id: string;
  role: "bot" | "user";
  text: string;
  time: string;
  options?: string[];
  articleRef?: string;
  handoff?: boolean;
};

const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    role: "bot",
    text: "👋 Hi! I'm the NexusOps Virtual Agent. I can help you with IT support, service requests, password resets, and more.\n\nWhat can I help you with today?",
    time: "now",
    options: [
      "🔐 Reset my password",
      "💻 Request new hardware",
      "🌐 VPN / Remote access issue",
      "🎫 Check my open tickets",
      "📦 Track my service request",
      "🤝 Talk to a human agent",
    ],
  },
];

const BOT_FLOWS: Record<string, { reply: string; options?: string[]; articleRef?: string; handoff?: boolean }> = {
  "🔐 Reset my password": {
    reply: "I can help you reset your password. Which account needs resetting?\n\n**Note**: For Active Directory / Windows login, I can trigger an immediate reset.",
    options: ["Windows / Active Directory", "Microsoft 365 / Email", "VPN Account", "Application-specific password"],
  },
  "Windows / Active Directory": {
    reply: "✅ I've initiated a password reset for your Windows account.\n\nA temporary password has been sent to your registered mobile number.\n\nPlease log in and change it within **24 hours**.\n\nA ticket has been created and you will receive a confirmation email shortly.",
    options: ["That worked, thanks!", "I didn't receive the SMS", "I need further help"],
  },
  "💻 Request new hardware": {
    reply: "I can submit a hardware request for you. What type of hardware do you need?",
    options: ["Laptop / Workstation", "Monitor / Peripherals", "Mobile Device", "Printer", "Other hardware"],
  },
  "Laptop / Workstation": {
    reply: "I'll create a service request for a new laptop. A few quick questions:\n\n1. Is this for yourself or another employee?\n2. What is the business justification?\n\nOr would you like me to pre-fill with standard specs and route for manager approval?",
    options: ["Pre-fill with standard specs", "I'll specify requirements", "Cancel"],
  },
  "Pre-fill with standard specs": {
    reply: "✅ Service request submitted!\n\nYour laptop request has been created and is pending manager approval.\n\n📋 Status: **Pending manager approval**\n⏱ Estimated delivery: **5–7 business days**\n\nYou'll receive an email notification when it's approved.",
    options: ["View my request", "I need something else"],
  },
  "🌐 VPN / Remote access issue": {
    reply: "I found a **Known Error** that may match your issue:\n\nVPN client crashes on recent macOS versions.\n\n**Workaround**: Downgrade to the previous VPN client version via the Self-Service Portal.\n\nDoes this match your issue?",
    options: ["Yes, that fixed it!", "No, different issue", "Open an incident instead"],
  },
  "Yes, that fixed it!": {
    reply: "Excellent! I'm glad that resolved it. 🎉\n\nI've marked this interaction as resolved. Was this support experience helpful?",
    options: ["👍 Yes, very helpful", "👎 Not quite"],
  },
  "No, different issue": {
    reply: "Let me gather more details to create an incident for you.\n\nPlease describe your VPN issue:",
    options: ["Can't connect at all", "Connects but can't access resources", "Keeps disconnecting", "Slow performance"],
  },
  "Can't connect at all": {
    reply: "I've created an incident for your VPN connectivity issue.\n\n**Priority**: P3 – Moderate\n**Assigned to**: Network Operations\n\nExpected response within **4 hours**. You'll receive updates by email.",
    options: ["Track this ticket", "I need more help"],
  },
  "🎫 Check my open tickets": {
    reply: "Let me pull up your open tickets from the system. Please check the **My Tickets** section in the navigation for a live view of all your open requests and incidents.",
    options: ["Open My Tickets", "Raise a new request", "All caught up, thanks!"],
  },
  "🤝 Talk to a human agent": {
    reply: "I'll connect you with a live agent now.\n\n⏱ **Estimated wait**: 2 minutes\n👤 **Queue position**: 3rd\n📞 **Team**: IT Service Desk\n\nYour conversation history will be shared with the agent.",
    handoff: true,
    options: ["Connect me now", "Actually, let me try self-service first"],
  },
  "👍 Yes, very helpful": { reply: "Thank you for the feedback! 🙏 Have a great day. Is there anything else I can help with?" },
  "👎 Not quite": { reply: "I'm sorry to hear that. Your feedback helps us improve. I've escalated this interaction for review. Is there anything specific that could be improved?" },
  "That worked, thanks!": { reply: "Great! 🎉 Is there anything else I can help you with today?" },
  "I need something else": { reply: "Of course! What can I help you with?", options: ["🔐 Reset my password", "💻 Request new hardware", "🌐 VPN issue", "🎫 Check tickets", "🤝 Human agent"] },
};

export default function VirtualAgentPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [view, setView] = useState<"chat" | "analytics">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: myTicketsData } = trpc.tickets.list.useQuery({ limit: 5, statusCategory: "open", ticketScope: "mine" }, mergeTrpcQueryOpts("tickets.list", { enabled: can("incidents", "read"), refetchOnWindowFocus: false },));
  const createTicketMutation = trpc.tickets.create.useMutation({
    onSuccess: (ticket: any) => {
      addMessage(`✅ Ticket created!\n\n**${ticket.number}** — ${ticket.title}\n**Priority**: ${ticket.priority ?? "P3"}\n**Status**: Open\n\nThe IT team will respond shortly.`, "bot", {
        options: ["Track this ticket", "I need more help", "🤝 Talk to a human agent"],
      });
    },
    onError: (e: any) => { addMessage(`Sorry, I couldn't create the ticket: ${e.message}. Please try again or contact the helpdesk.`, "bot"); },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!can("virtual_agent", "read") && !can("catalog", "read")) return <AccessDenied module="Virtual Agent" />;

  const addMessage = (text: string, role: "user" | "bot", extra?: Partial<Message>) => {
    const msg: Message = {
      id: Math.random().toString(36).slice(2),
      role,
      text,
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      ...extra,
    };
    setMessages((m) => [...m, msg]);
  };

  // ── NLU Engine ─────────────────────────────────────────────────────────────

  type Intent =
    | "check_tickets" | "create_ticket" | "password_reset" | "vpn_issue"
    | "hardware_request" | "software_request" | "access_request" | "onboarding"
    | "offboarding" | "hr_query" | "payslip" | "leave_request" | "human_handoff"
    | "greeting" | "thanks" | "catalog_browse" | "track_request" | "knowledge_search"
    | "fallback";

  function classifyIntent(text: string): { intent: Intent; entities: Record<string, string>; confidence: number } {
    const t = text.toLowerCase().trim();
    const entities: Record<string, string> = {};
    const ticketMatch = t.match(/(?:tkt|ticket|inc|req|chg|prb|srd)[-\s]?\d{4,}/i);
    if (ticketMatch) entities.ticketId = ticketMatch[0].toUpperCase().replace(/\s/g, "-");
    const patterns: [Intent, RegExp, number][] = [
      ["greeting",        /^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy)\b/i, 0.95],
      ["thanks",          /\b(thank|thanks|cheers|appreciate|great|perfect|solved|that.*helped)\b/i, 0.9],
      ["human_handoff",   /\b(human|agent|person|live|escalate|speak.*to.*someone|talk.*human|connect.*agent)\b/i, 0.95],
      ["check_tickets",   /\b(check|view|show|list|my)\b.*\b(tickets?|incidents?|requests?|issues?)\b|\b(open|pending|raised)\b.*\bticket/i, 0.9],
      ["track_request",   /\b(track|status|update|progress|where.*(is|are)|what.*happened)\b.*\b(ticket|request|incident|case)\b/i, 0.85],
      ["password_reset",  /\b(password|passwd|pwd|credentials?|login|unlock|account.*locked|forgot.*pass|reset.*pass|expired.*password)\b/i, 0.95],
      ["vpn_issue",       /\b(vpn|remote.*access|tunnel|cisco.*any|pulse.*secure|can.?t.*connect.*remote)\b/i, 0.9],
      ["hardware_request",/\b(laptop|desktop|monitor|keyboard|mouse|headset|printer|webcam|hardware|equipment)\b.*\b(need|want|request|broken|not.*work)\b|\b(request|need|want)\b.*\b(laptop|desktop|monitor|keyboard)\b/i, 0.85],
      ["software_request",/\b(software|license|app|install|adobe|office|jira|slack|teams|zoom)\b.*\b(need|want|request|access|install)\b|\b(request|need|want)\b.*\b(software|license|access)\b/i, 0.85],
      ["access_request",  /\b(access|permission|role|group|ad.*group|shared.*drive|server|database|portal)\b.*\b(need|request|grant|add|remove|change)\b/i, 0.85],
      ["onboarding",      /\b(onboard|new.*joiner|new.*hire|joining|first.*day|new.*employee)\b/i, 0.9],
      ["offboarding",     /\b(offboard|resign|leaving|last.*day|exit|termination|deactivate.*account)\b/i, 0.9],
      ["hr_query",        /\b(hr|human.*resource|policy|leave.*policy|attendance|contract|offer.*letter|appraisal|performance)\b/i, 0.8],
      ["payslip",         /\b(payslip|pay.*slip|salary|ctc|take.*home|paycheck|payroll|form.*16|tax.*deduction)\b/i, 0.9],
      ["leave_request",   /\b(leave|vacation|holiday|time.*off|sick.*day|casual.*leave|sick.*leave|annual.*leave)\b/i, 0.9],
      ["catalog_browse",  /\b(catalog|service.*catalog|browse|order|request.*service|what.*can.*you|services.*available)\b/i, 0.8],
      ["knowledge_search",/\b(how.*do|how.*to|article|knowledge|documentation|guide|tutorial|step|procedure|process)\b/i, 0.75],
      ["create_ticket",   /\b(create|raise|open|log|submit|report)\b.*\b(ticket|incident|request|issue|problem)\b|\b(not.*working|broken|error|failed|issue|problem)\b/i, 0.7],
    ];
    for (const [intent, pattern, confidence] of patterns) {
      if (pattern.test(t)) return { intent, entities, confidence };
    }
    return { intent: "fallback", entities, confidence: 0.3 };
  }

  function generateNLUResponse(userText: string): { text: string; options?: string[]; handoff?: boolean; articleRef?: string } {
    const { intent, entities } = classifyIntent(userText);
    const tickets = (myTicketsData as any)?.items ?? (myTicketsData as any) ?? [];
    switch (intent) {
      case "greeting":
        return { text: "Hello! 👋 What can I help you with today?", options: ["🔐 Password reset", "🎫 My open tickets", "💻 Request hardware", "🌐 VPN issue", "📋 Browse service catalog", "🤝 Talk to an agent"] };
      case "thanks":
        return { text: "You're welcome! 😊 Is there anything else I can help with?", options: ["No, all good!", "Yes, one more thing", "🤝 Talk to an agent"] };
      case "human_handoff":
        return { text: "Connecting you to a live agent now.\n\n⏱ **Estimated wait**: 2-3 minutes\n👥 **Team**: IT Service Desk\n📋 Your conversation will be shared with the agent.", handoff: true, options: ["Yes, connect me", "Actually, let me try self-service first"] };
      case "check_tickets": {
        if (tickets.length === 0) return { text: "You have no open tickets right now. 🎉", options: ["Submit a new request", "Browse service catalog"] };
        const list = tickets.slice(0, 5).map((t: any, i: number) => `${i+1}. **${t.number}** — ${t.title}\n   Status: ${t.status} | Priority: ${t.priority ?? "P3"}`).join("\n\n");
        return { text: `You have **${tickets.length}** open ticket${tickets.length > 1 ? "s" : ""}:\n\n${list}`, options: ["View all in portal", "Raise a new ticket"] };
      }
      case "track_request": {
        if (entities.ticketId) {
          const found = tickets.find((t: any) => t.number?.toUpperCase() === entities.ticketId?.toUpperCase());
          if (found) return { text: `Found **${found.number}**: ${found.title}\n\n📋 **Status**: ${found.status}\n⚡ **Priority**: ${found.priority ?? "P3"}`, options: ["That's all I need", "Escalate this", "🤝 Talk to an agent"] };
        }
        return { text: "Please provide the ticket number (e.g. TKT-1234) to track it.", options: ["View my tickets", "🤝 Talk to an agent"] };
      }
      case "password_reset":
        return { text: "I can help reset your password!\n\nWhich account needs resetting?", options: ["Windows / Active Directory", "Microsoft 365 / Email", "VPN credentials", "Application-specific"] };
      case "vpn_issue":
        return { text: "**Known Issue**: Cisco AnyConnect may crash on macOS 14+.\n**Workaround**: Use web-based VPN at vpn.company.com\n\nDoes this match your issue?", options: ["Yes, that helps!", "No, different issue", "Open a VPN incident", "🤝 Talk to an agent"], articleRef: "KB-2341: VPN Connectivity Troubleshooting" };
      case "hardware_request":
        return { text: "I'll raise a hardware request!\n\nWhat do you need?", options: ["New laptop for me", "Replacement for broken device", "Equipment for new hire", "Peripheral (keyboard/mouse/headset)", "Open hardware request form"] };
      case "software_request":
        return { text: "What software do you need access to?", options: ["Adobe Creative Cloud", "Microsoft 365 / Office", "Jira / Confluence", "Slack / Teams", "Other software"] };
      case "access_request":
        return { text: "What type of access do you need?", options: ["AD Group / Distribution list", "Shared drive / SharePoint", "Application role", "Database access", "Server / SSH access"] };
      case "leave_request":
        return { text: "Leave requests go through the **Employee Portal**.\n\n📋 **CL**: 12 days/year | 🏖️ **AL**: Based on tenure | 🤒 **SL**: With/without medical cert", options: ["Open Employee Portal", "Check my leave balance", "Leave policy details", "🤝 Talk to HR"], articleRef: "KB-0891: Company Leave Policy" };
      case "payslip":
        return { text: "Payslips are in the **HR Portal**: My Profile → Payroll → Payslips.\n\nFor Form 16, contact Payroll team after April.", options: ["Open Employee Portal", "Payroll queries", "🤝 Talk to Payroll team"] };
      case "hr_query":
        return { text: "What HR query do you have?", options: ["Leave balance", "Payslip / Payroll", "Appraisal / Performance", "Policy document", "🤝 Talk to HR directly"] };
      case "onboarding":
        return { text: "New joiner setup! I can help with:\n\n✅ Hardware provisioning\n✅ Email and AD account setup\n✅ Software access based on role\n✅ VPN and remote access\n\nShall I create an onboarding ticket?", options: ["Create onboarding ticket", "What access is included?", "🤝 Talk to IT onboarding team"] };
      case "catalog_browse":
        return { text: "The **Service Catalog** has everything:\n\n📦 Hardware | 🔑 Software | 🌐 Network | 🏢 Facilities\n\nWhich category interests you?", options: ["Browse full catalog", "Hardware requests", "Software licenses", "Facilities"] };
      case "knowledge_search":
        return { text: "The Knowledge Base has guides for most issues. What are you trying to do?", options: ["Open Knowledge Base", "VPN setup guide", "Password reset guide", "Software installation guide", "🤝 Talk to an agent"], articleRef: "Knowledge Base — Search available 24/7" };
      case "create_ticket":
        return { text: `Creating a ticket:\n\n**Title**: ${userText.slice(0, 100)}\n**Priority**: P3 — Moderate\n\nShall I submit this?`, options: ["Yes, create ticket", "Add more details first", "Set priority P1 (Critical)", "Cancel"] };
      default:
        return { text: `I'm not sure about "${userText.slice(0, 60)}..." but I can:\n- Create a support ticket\n- Connect you with an agent\n- Search the Knowledge Base`, options: ["Create a ticket for this", "Search Knowledge Base", "🤝 Talk to a human agent"] };
    }
  }

  const handleOption = (opt: string) => {
    addMessage(opt, "user");
    setTimeout(() => {
      if (opt === "Yes, create ticket" || opt === "Create ticket now" || opt === "Create onboarding ticket" || opt === "Open a VPN incident" || opt === "Raise a new ticket") {
        const lastUserMsg = [...messages].reverse().find(m => m.role === "user" && m.text !== opt)?.text ?? "Support request";
        if (can("incidents", "write")) {
          createTicketMutation.mutate({ title: lastUserMsg.slice(0, 200), description: lastUserMsg });
        } else {
          addMessage("You don't have permission to create tickets. Please contact your IT team directly.", "bot");
        }
        return;
      }
      if (opt.includes("Open Employee Portal")) { router.push("/app/employee-portal"); addMessage("Opening Employee Portal...", "bot"); return; }
      if (opt.includes("Browse full catalog") || opt === "📋 Browse service catalog") { router.push("/app/catalog"); addMessage("Opening Service Catalog...", "bot"); return; }
      if (opt.includes("Open Knowledge Base") || opt === "Search Knowledge Base") { router.push("/app/knowledge"); addMessage("Opening Knowledge Base...", "bot"); return; }
      if (opt === "View all in portal" || opt.includes("View my tickets")) { router.push("/app/tickets"); addMessage("Opening your tickets...", "bot"); return; }
      if (opt === "No, all good!") { addMessage("Great! Have a wonderful day! 😊 Feel free to come back anytime.", "bot"); return; }
      const response = generateNLUResponse(opt);
      addMessage(response.text, "bot", { options: response.options, handoff: response.handoff, articleRef: response.articleRef });
    }, 500);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    addMessage(text, "user");
    setTimeout(() => {
      const response = generateNLUResponse(text);
      addMessage(response.text, "bot", { options: response.options, handoff: response.handoff, articleRef: response.articleRef });
    }, 600);
  };

  const totalVolume = messages.filter(m => m.role === "user").length;
  const totalDeflected = messages.filter(m => m.role === "user" && m.text !== "🤝 Talk to a human agent" && m.text !== "Connect me now").length;
  const avgDeflection = totalVolume > 0 ? Math.round((totalDeflected / totalVolume) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-600" />
          <h1 className="text-sm font-semibold text-foreground">Virtual Agent</h1>
          <span className="text-[11px] text-muted-foreground/70">NLP-powered self-service · Ticket deflection · Live handoff</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView("chat")} className={`px-3 py-1 text-[11px] rounded border ${view === "chat" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:bg-muted/30"}`}>Chat</button>
          <button onClick={() => setView("analytics")} className={`px-3 py-1 text-[11px] rounded border ${view === "analytics" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:bg-muted/30"}`}>Analytics</button>
        </div>
      </div>

      {view === "chat" ? (
        <div className="flex gap-3 flex-1">
          <div className="flex flex-col flex-1 bg-card border border-border rounded overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-gradient-to-r from-purple-600 to-blue-600">
              <div className="w-7 h-7 rounded-full bg-card/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-[12px] font-semibold text-white">NexusOps Virtual Agent</div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] text-white/80">Online · Powered by Now Intelligence</span>
                </div>
              </div>
              <button onClick={() => setMessages(INITIAL_MESSAGES)} className="ml-auto p-1 text-white/60 hover:text-white">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30/50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "bot" && (
                    <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-purple-600" />
                    </div>
                  )}
                  <div className={`max-w-sm ${msg.role === "user" ? "order-first" : ""}`}>
                    <div className={`rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-white rounded-tr-sm"
                        : "bg-card border border-border text-foreground/80 rounded-tl-sm shadow-sm"
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                      {msg.articleRef && (
                        <div
                          onClick={() => router.push("/app/knowledge")}
                          className="mt-2 flex items-center gap-1.5 p-2 bg-blue-50 rounded border border-blue-200 cursor-pointer hover:bg-blue-100"
                        >
                          <BookOpen className="w-3 h-3 text-blue-600 flex-shrink-0" />
                          <span className="text-[11px] text-blue-700 font-medium">{msg.articleRef}</span>
                          <ChevronRight className="w-3 h-3 text-blue-500 ml-auto" />
                        </div>
                      )}
                      {msg.handoff && (
                        <div className="mt-2 p-2 bg-orange-50 rounded border border-orange-200 text-[11px] text-orange-700">
                          🔄 Connecting to human agent...
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5 px-1">{msg.time}</div>
                    {msg.options && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => handleOption(opt)}
                            className="px-2.5 py-1 bg-card border border-border rounded-full text-[11px] text-foreground/80 hover:bg-primary hover:text-white hover:border-primary transition-colors"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-border p-3 bg-card">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Type a message or describe your issue..."
                  className="flex-1 px-3 py-2 text-[12px] border border-border rounded-full outline-none focus:ring-1 focus:ring-primary/50 text-foreground/80 placeholder:text-muted-foreground/70"
                />
                <button onClick={handleSend} className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Side panel */}
          <div className="w-56 flex-shrink-0 space-y-3">
            <div className="bg-card border border-border rounded p-3">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Session Info</div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between"><span className="text-muted-foreground">User</span><span className="text-foreground/80 font-medium">Admin User</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Messages</span><span className="text-foreground/80">{messages.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Topics</span><span className="text-foreground/80">IT Support</span></div>
              </div>
            </div>
            <div className="bg-card border border-border rounded p-3">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Quick Topics</div>
              <div className="space-y-1">
                {["Password Reset", "VPN Help", "Hardware Request", "Open Tickets"].map((t) => (
                  <button key={t} onClick={() => handleOption(t)} className="w-full text-left text-[11px] px-2 py-1.5 text-muted-foreground hover:bg-muted/30 rounded">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total Conversations (30d)", value: totalVolume, color: "text-foreground/80" },
                { label: "Tickets Deflected",        value: totalDeflected, color: "text-green-700" },
                { label: "Deflection Rate",          value: `${avgDeflection}%`, color: "text-green-700" },
                { label: "Avg. Resolution Time",     value: "3m 42s", color: "text-blue-700" },
              ].map((k) => (
                <div key={k.label}>
                  <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
                </div>
              ))}
            </div>
          </div>
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th>Topic</th>
                <th className="text-center">Volume</th>
                <th className="text-center">Deflected</th>
                <th className="text-center">Deflection Rate</th>
                <th>Visual</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="text-center py-6 text-[11px] text-muted-foreground/50">No analytics data available yet — interaction history will appear here</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, RefreshCw, User, Zap, BookOpen, Wrench, TicketIcon, ChevronRight, ThumbsUp, ThumbsDown, X, Maximize2 } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

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
    reply: "✅ I've initiated a password reset for your Windows account.\n\nA temporary password has been sent to your registered mobile number ending in **••7842**.\n\nPlease log in and change it within **24 hours**.\n\n**Ticket created**: COHE-1098",
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
    reply: "✅ Service request submitted!\n\n**REQ0001251** — Laptop Request (Dell Latitude 5450, 16GB RAM, 512GB SSD)\n\n📋 Status: **Pending manager approval**\n⏱ Estimated delivery: **5–7 business days**\n\nI'll notify you when approved.",
    options: ["View my request", "I need something else"],
  },
  "🌐 VPN / Remote access issue": {
    reply: "I found a **Known Error** that may match your issue:\n\n**KB0001233**: VPN client v4.2.1 crashes on macOS Sequoia 15.4\n\n**Workaround**: Downgrade to v4.1.9 via the Self-Service Portal.\n\nDoes this match your issue?",
    options: ["Yes, that fixed it!", "No, different issue", "Open an incident instead"],
    articleRef: "KB0001233",
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
    reply: "I've created an incident for your VPN connectivity issue.\n\n**COHE-1099** — VPN: Cannot connect\n**Priority**: P3 – Moderate\n**Assigned to**: Network Operations\n\nExpected response within **4 hours**. I'll send you updates by email.",
    options: ["Track this ticket", "I need more help"],
  },
  "🎫 Check my open tickets": {
    reply: "Here are your **3 open tickets**:\n\n1. **COHE-1089** — Laptop running slow (In Progress)\n2. **COHE-1076** — Printer not connecting to VLAN (Pending)\n3. **COHE-0999** — Software license request (Awaiting Approval)\n\nWould you like details on any of these?",
    options: ["COHE-1089 details", "COHE-1076 details", "All caught up, thanks!"],
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
  const { can } = useRBAC();
  if (!can("virtual_agent", "read") && !can("catalog", "read")) return <AccessDenied module="Virtual Agent" />;
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [view, setView] = useState<"chat" | "analytics">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const handleOption = (opt: string) => {
    addMessage(opt, "user");
    setTimeout(() => {
      const flow = BOT_FLOWS[opt];
      if (flow) {
        addMessage(flow.reply, "bot", { options: flow.options, articleRef: flow.articleRef, handoff: flow.handoff });
      } else {
        addMessage(`I understand you need help with "${opt}". Let me create a ticket for you. Can you provide more details?`, "bot");
      }
    }, 600);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    addMessage(text, "user");
    setTimeout(() => {
      addMessage("I'm processing your request. Based on your message, I can help you with that. Would you like me to create a ticket or try self-service options?", "bot", {
        options: ["Create a ticket", "Show self-service options", "Talk to an agent"],
      });
    }, 800);
  };

  const totalVolume = 0;
  const totalDeflected = 0;
  const avgDeflection = 0;

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
                        <div className="mt-2 flex items-center gap-1.5 p-2 bg-blue-50 rounded border border-blue-200">
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

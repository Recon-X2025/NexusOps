"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sparkles, Send, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * NexusOps Copilot — multi-turn chat with persistent server-side memory.
 *
 * Server-side state of the truth: messages, conversation list, and tool
 * results all live in `agent_conversations` / `agent_messages`. The
 * client only holds the active conversation id and a transient
 * "in-flight" turn while the request is on the wire.
 */
export default function AgentChatPage() {
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const conversationsQuery = trpc.agent.listConversations.useQuery();
  const conversationQuery = trpc.agent.getConversation.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
  );
  const utils = trpc.useUtils();

  const chatMutation = trpc.agent.chat.useMutation({
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      utils.agent.listConversations.invalidate();
      utils.agent.getConversation.invalidate({ conversationId: data.conversationId });
    },
  });

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [conversationQuery.data?.messages.length, chatMutation.isPending]);

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || chatMutation.isPending) return;
    chatMutation.mutate({ conversationId, message: trimmed });
    setDraft("");
  };

  const messages = conversationQuery.data?.messages ?? [];

  return (
    <div className="flex h-[calc(100vh-64px)] gap-4 p-4">
      <aside className="hidden w-64 shrink-0 overflow-y-auto rounded-lg border border-border bg-card p-3 lg:block">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Conversations
          </h2>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setConversationId(undefined)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="space-y-1">
          {(conversationsQuery.data ?? []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setConversationId(c.id)}
                className={cn(
                  "w-full truncate rounded px-2 py-1.5 text-left text-sm",
                  c.id === conversationId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
              >
                {c.title}
              </button>
            </li>
          ))}
          {(conversationsQuery.data ?? []).length === 0 && (
            <li className="text-xs text-muted-foreground">No conversations yet.</li>
          )}
        </ul>
      </aside>

      <main className="flex flex-1 flex-col rounded-lg border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <h1 className="text-base font-semibold">NexusOps Copilot</h1>
          <span className="ml-2 text-xs text-muted-foreground">
            Ask questions or request actions like &quot;file an incident for printer down&quot;.
          </span>
        </header>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
          {!conversationId && messages.length === 0 && (
            <div className="mx-auto max-w-md py-12 text-center">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-violet-500" />
              <p className="text-sm text-muted-foreground">
                Hi — I can answer questions about NexusOps and, when you ask, file
                tickets or update statuses on your behalf. I&apos;ll always read back
                actions before running them.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "mb-3 flex",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  m.role === "user" && "bg-primary text-primary-foreground",
                  m.role === "assistant" && "bg-muted",
                  m.role === "tool" &&
                    "border border-dashed border-border bg-background text-xs text-muted-foreground",
                )}
              >
                {m.role === "tool" ? (
                  <span>
                    <span className="font-mono text-[10px] uppercase">{m.toolName}</span>
                    {" — "}
                    {m.toolResultPreview ?? m.content}
                  </span>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}
          {chatMutation.error && (
            <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {chatMutation.error.message}
            </div>
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-border px-4 py-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder="Ask the Copilot…  (Enter to send, Shift+Enter for newline)"
            className="flex-1 resize-none rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || chatMutation.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
      </main>
    </div>
  );
}

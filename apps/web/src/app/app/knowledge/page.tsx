"use client";

import { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  Search,
  Plus,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Clock,
  Filter,
  ChevronRight,
  FileText,
  Loader2,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { formatRelativeTime } from "@/lib/utils";

const STATUS_TABS = [
  { key: "all",       label: "All",       module: "knowledge" as const, action: "read"   as const },
  { key: "published", label: "Published", module: "knowledge" as const, action: "read"   as const },
  { key: "draft",     label: "Draft",     module: "knowledge" as const, action: "write"  as const },
  { key: "archived",  label: "Archived",  module: "knowledge" as const, action: "delete" as const },
];

export default function KnowledgePage() {
  const { can } = useRBAC();
  const visibleTabs = STATUS_TABS.filter((t) => can(t.module, t.action));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState(visibleTabs[0]?.key ?? "all");

  if (!can("knowledge", "read")) return <AccessDenied module="Knowledge Management" />;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const { data, isLoading } = trpc.knowledge.list.useQuery(
    {
      search: debouncedSearch || undefined,
      status: activeStatus !== "all" ? activeStatus : undefined,
      limit: 50,
    },
    { refetchOnWindowFocus: false },
  );

  type ArticleItem = NonNullable<typeof data>[number];
  const articles: ArticleItem[] = data ?? [];
  const publishedCount = articles.filter((a) => a.status === "published").length;
  const totalViews = articles.reduce((s, a) => s + (a.viewCount ?? 0), 0);
  const totalHelpful = articles.reduce((s, a) => s + (a.helpfulCount ?? 0), 0);
  const totalFeedback = articles.reduce(
    (s, a) => s + (a.helpfulCount ?? 0) + (a.notHelpfulCount ?? 0),
    0,
  );
  const helpfulRate = totalFeedback > 0 ? Math.round((totalHelpful / totalFeedback) * 100) : 0;
  const draftCount = articles.filter((a) => a.status === "draft").length;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Knowledge Base</h1>
          <span className="text-[11px] text-muted-foreground">
            {isLoading ? "Loading…" : `${publishedCount} published article${publishedCount !== 1 ? "s" : ""}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate module="knowledge" action="admin">
            <button className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-accent">
              <Filter className="w-3 h-3" /> Manage
            </button>
          </PermissionGate>
          <PermissionGate module="knowledge" action="write">
            <button className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-[11px] font-medium rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> New Article
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Published Articles", value: publishedCount,                  color: "text-blue-700" },
          { label: "Total Views",        value: totalViews.toLocaleString(),     color: "text-foreground" },
          { label: "Helpful Rate",       value: `${helpfulRate}%`,               color: "text-green-700" },
          { label: "Pending Review",     value: draftCount,                      color: "text-yellow-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          placeholder="Search knowledge articles by title, keyword, or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-[13px] text-foreground placeholder:text-muted-foreground outline-none flex-1 bg-transparent"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="text-muted-foreground/60 hover:text-muted-foreground text-[11px]"
          >
            ✕
          </button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveStatus(tab.key)}
            className={`px-3 py-1 text-[11px] rounded-full border transition-colors
              ${activeStatus === tab.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Article list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading articles…</span>
        </div>
      ) : articles.length === 0 ? (
        <div className="bg-card border border-border rounded flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
          <BookOpen className="w-5 h-5 opacity-30" />
          <span className="text-xs">{search ? "No articles match your search." : "No articles yet."}</span>
        </div>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => {
            const isExpanded = expandedId === article.id;
            const excerpt = article.content
              ? article.content.replace(/#{1,6}\s|[*_`]/g, "").slice(0, 200) + (article.content.length > 200 ? "…" : "")
              : null;

            return (
              <div
                key={article.id}
                className="bg-card border border-border rounded hover:border-primary/30 transition-all"
              >
                <div
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : article.id)}
                >
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <BookOpen className="w-4 h-4 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span
                            className={`status-badge ${
                              article.status === "published"
                                ? "text-green-700 bg-green-100"
                                : article.status === "draft"
                                  ? "text-yellow-700 bg-yellow-100"
                                  : "text-muted-foreground bg-muted"
                            }`}
                          >
                            {article.status}
                          </span>
                          {(article.tags as string[]).slice(0, 3).map((tag: string) => (
                            <span key={tag} className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[10px]">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <h3 className="text-[13px] font-semibold text-foreground truncate">{article.title}</h3>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-shrink-0">
                        <span className="flex items-center gap-0.5">
                          <Eye className="w-3 h-3" /> {(article.viewCount ?? 0).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-0.5 text-green-600">
                          <ThumbsUp className="w-3 h-3" /> {article.helpfulCount ?? 0}
                        </span>
                        <span className="flex items-center gap-0.5 text-red-500">
                          <ThumbsDown className="w-3 h-3" /> {article.notHelpfulCount ?? 0}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                        <Clock className="w-3 h-3" /> Updated {formatRelativeTime(article.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <ChevronRight
                    className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform mt-1 ${isExpanded ? "rotate-90" : ""}`}
                  />
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border bg-muted/20">
                    {excerpt && (
                      <p className="text-[12px] text-muted-foreground mt-3 leading-relaxed">{excerpt}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      <button className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-[11px] rounded hover:bg-primary/90">
                        <BookOpen className="w-3 h-3" /> Read Full Article
                      </button>
                      <PermissionGate module="knowledge" action="write">
                        <button className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-accent">
                          <FileText className="w-3 h-3" /> Edit
                        </button>
                      </PermissionGate>
                      <button className="text-[11px] text-muted-foreground hover:underline">Share Link</button>
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">Was this helpful?</span>
                        <button className="flex items-center gap-0.5 text-[11px] text-green-600 hover:text-green-700 border border-green-200 px-2 py-0.5 rounded hover:bg-green-50">
                          <ThumbsUp className="w-3 h-3" /> Yes
                        </button>
                        <button className="flex items-center gap-0.5 text-[11px] text-red-500 hover:text-red-600 border border-red-200 px-2 py-0.5 rounded hover:bg-red-50">
                          <ThumbsDown className="w-3 h-3" /> No
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

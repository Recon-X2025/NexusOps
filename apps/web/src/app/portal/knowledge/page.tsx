"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  BookOpen,
  Search,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react";

export default function PortalKnowledgePage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const { data, isLoading, isError } = trpc.knowledge.list.useQuery(
    { search: search || undefined, status: "published", limit: 50 },
    { refetchOnWindowFocus: false },
  );

  const feedbackMutation = trpc.knowledge.recordFeedback.useMutation({
    onSuccess: () => toast.success("Thanks for your feedback!"),
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  const articles = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Knowledge Base</h1>
        <p className="text-xs text-gray-500">
          Search articles and guides to find answers quickly.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search knowledge base…"
          className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {searchInput && (
          <button
            onClick={() => { setSearchInput(""); setSearch(""); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Results count */}
      {!isLoading && !isError && (
        <p className="text-xs text-gray-400">
          {articles.length === 0
            ? search
              ? `No articles found for "${search}"`
              : "No published articles available."
            : `${articles.length} article${articles.length !== 1 ? "s" : ""}${search ? ` for "${search}"` : ""}`}
        </p>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-16">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Unable to load articles. Please refresh and try again.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && articles.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <BookOpen className="h-10 w-10 text-gray-300" />
          <div>
            <p className="text-sm font-medium text-gray-600">
              {search ? "No matching articles" : "No articles yet"}
            </p>
            <p className="text-xs text-gray-400">
              {search
                ? "Try a different search term."
                : "Knowledge base articles will appear here."}
            </p>
          </div>
        </div>
      )}

      {/* Article list */}
      {!isLoading && !isError && articles.length > 0 && (
        <div className="flex flex-col gap-2">
          {articles.map((article: any) => {
            const isExpanded = expandedId === article.id;
            return (
              <div
                key={article.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                {/* Article header / click to expand */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : article.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{article.title}</p>
                    {!isExpanded && (
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-gray-500">
                        {article.content
                          ? article.content.replace(/[#*`>_~]/g, "").slice(0, 120) + (article.content.length > 120 ? "…" : "")
                          : "No preview available."}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                      {article.tags && (article.tags as string[]).length > 0 && (article.tags as string[]).map((tag) => (
                        <span key={tag} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-600">
                          {tag}
                        </span>
                      ))}
                      {article.viewCount != null && (
                        <span>{article.viewCount} views</span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-4">
                    <div className="prose prose-sm max-w-none text-sm text-gray-700 whitespace-pre-wrap">
                      {article.content ?? "No content available."}
                    </div>

                    {/* Feedback */}
                    <div className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4">
                      <span className="text-xs text-gray-500">Was this helpful?</span>
                      <button
                        onClick={() =>
                          feedbackMutation.mutate({
                            articleId: article.id,
                            helpful: true,
                          })
                        }
                        disabled={feedbackMutation.isPending}
                        className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Yes
                        {article.helpfulCount != null && article.helpfulCount > 0 && (
                          <span className="ml-0.5 text-green-600">({article.helpfulCount})</span>
                        )}
                      </button>
                      <button
                        onClick={() =>
                          feedbackMutation.mutate({
                            articleId: article.id,
                            helpful: false,
                          })
                        }
                        disabled={feedbackMutation.isPending}
                        className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        No
                      </button>
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

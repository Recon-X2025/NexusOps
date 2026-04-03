"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BookOpen, ChevronRight, Edit2, Check, X, Eye, ThumbsUp, ThumbsDown,
  Clock, Tag, Save, ArrowLeft, Globe, Lock, Loader2, Share2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRBAC, PermissionGate } from "@/lib/rbac-context";
import { formatRelativeTime } from "@/lib/utils";

export default function KnowledgeArticlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useRBAC();

  const isEditMode = searchParams.get("edit") === "1";
  const [editing, setEditing] = useState(isEditMode);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");

  const utils = trpc.useUtils();
  const { data: article, isLoading, isError } = trpc.knowledge.get.useQuery(
    { id },
    {
      onSuccess: (a) => {
        if (!editTitle) setEditTitle(a.title);
        if (!editContent) setEditContent(a.content ?? "");
        if (!editTags) setEditTags((a.tags as string[]).join(", "));
      },
    } as any,
  );

  const updateMutation = trpc.knowledge.update.useMutation({
    onSuccess: () => {
      toast.success("Article saved");
      setEditing(false);
      utils.knowledge.get.invalidate({ id });
      utils.knowledge.list.invalidate();
    },
    onError: (e) => toast.error(e?.message ?? "Save failed"),
  });

  const publishMutation = trpc.knowledge.publish.useMutation({
    onSuccess: () => {
      toast.success("Article published");
      utils.knowledge.get.invalidate({ id });
    },
    onError: (e) => toast.error(e?.message ?? "Publish failed"),
  });

  const feedbackMutation = trpc.knowledge.recordFeedback.useMutation({
    onSuccess: () => {
      toast.success("Thanks for your feedback!");
      utils.knowledge.get.invalidate({ id });
    },
    onError: (e) => toast.error(e?.message ?? "Something went wrong"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60 gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Loading article…</span>
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-2 text-muted-foreground">
        <BookOpen className="w-8 h-8 opacity-30" />
        <span className="text-sm">Article not found.</span>
        <Link href="/app/knowledge" className="text-primary text-[12px] hover:underline">
          ← Back to Knowledge Base
        </Link>
      </div>
    );
  }

  const tags = article.tags as string[];

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Link href="/app/knowledge" className="hover:text-foreground flex items-center gap-1">
          <BookOpen className="w-3 h-3" /> Knowledge Base
        </Link>
        <ChevronRight className="w-3 h-3 opacity-50" />
        <span className="text-foreground truncate max-w-xs">{article.title}</span>
      </nav>

      {/* Header */}
      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full text-lg font-bold border-b-2 border-primary outline-none bg-transparent text-foreground pb-1"
              />
            ) : (
              <h1 className="text-lg font-bold text-foreground">{article.title}</h1>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`status-badge ${
                article.status === "published"
                  ? "text-green-700 bg-green-100"
                  : article.status === "draft"
                    ? "text-yellow-700 bg-yellow-100"
                    : "text-muted-foreground bg-muted"
              }`}>
                {article.status === "published" ? <Globe className="w-3 h-3 inline mr-0.5" /> : <Lock className="w-3 h-3 inline mr-0.5" />}
                {article.status}
              </span>
              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Eye className="w-3 h-3" /> {(article.viewCount ?? 0).toLocaleString()} views
              </span>
              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" /> Updated {formatRelativeTime(article.updatedAt)}
              </span>
              {tags.slice(0, 4).map((t) => (
                <span key={t} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                  <Tag className="w-2.5 h-2.5" /> {t}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {editing ? (
              <>
                <button
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      id,
                      title: editTitle,
                      content: editContent,
                      tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-60"
                >
                  {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-muted/30"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("Link copied to clipboard");
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-muted/30"
                >
                  <Share2 className="w-3 h-3" /> Share
                </button>
                <PermissionGate module="knowledge" action="write">
                  {article.status === "draft" && (
                    <button
                      disabled={publishMutation.isPending}
                      onClick={() => publishMutation.mutate({ id })}
                      className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white text-[11px] rounded hover:bg-green-700 disabled:opacity-60"
                    >
                      {publishMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
                      Publish
                    </button>
                  )}
                  <button
                    onClick={() => { setEditTitle(article.title); setEditContent(article.content ?? ""); setEditTags(tags.join(", ")); setEditing(true); }}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-muted/30"
                  >
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                </PermissionGate>
              </>
            )}
            <button
              onClick={() => router.push("/app/knowledge")}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-muted/30"
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
          </div>
        </div>

        {/* Tags editor */}
        {editing && (
          <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="Tags (comma-separated)"
              className="flex-1 text-[12px] outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
            />
          </div>
        )}

        {/* Content */}
        <div className="px-5 py-5">
          {editing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={24}
              className="w-full text-[13px] leading-relaxed text-foreground outline-none resize-y font-mono bg-muted/20 p-3 rounded border border-border"
              placeholder="Write article content here (Markdown supported)…"
            />
          ) : article.content ? (
            <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed text-[13px] whitespace-pre-wrap">
              {article.content}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No content yet.</p>
              <PermissionGate module="knowledge" action="write">
                <button
                  onClick={() => setEditing(true)}
                  className="mt-3 text-primary text-[12px] hover:underline"
                >
                  Add content →
                </button>
              </PermissionGate>
            </div>
          )}
        </div>

        {/* Feedback footer */}
        {!editing && (
          <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center gap-4">
            <span className="text-[11px] text-muted-foreground">Was this article helpful?</span>
            <button
              disabled={feedbackMutation.isPending}
              onClick={() => feedbackMutation.mutate({ articleId: id, helpful: true })}
              className="flex items-center gap-1 text-[11px] text-green-600 hover:text-green-700 border border-green-200 px-2 py-0.5 rounded hover:bg-green-50 disabled:opacity-50"
            >
              <ThumbsUp className="w-3 h-3" /> Yes ({article.helpfulCount ?? 0})
            </button>
            <button
              disabled={feedbackMutation.isPending}
              onClick={() => feedbackMutation.mutate({ articleId: id, helpful: false })}
              className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 border border-red-200 px-2 py-0.5 rounded hover:bg-red-50 disabled:opacity-50"
            >
              <ThumbsDown className="w-3 h-3" /> No ({article.notHelpfulCount ?? 0})
            </button>
            <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
              {article.publishedAt && (
                <span>Published {formatRelativeTime(article.publishedAt)}</span>
              )}
              <Check className="w-3 h-3 text-green-500" />
              <span>Verified content</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

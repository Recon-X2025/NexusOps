"use client";

import { useState } from "react";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Package,
  Loader2,
  AlertCircle,
  AlertTriangle,
  X,
  CheckCircle,
  Clock,
  Wrench,
  Archive,
} from "lucide-react";
import Link from "next/link";

const STATUS_META: Record<string, { label: string; icon: React.ElementType; pill: string }> = {
  deployed: {
    label: "Deployed",
    icon: CheckCircle,
    pill: "bg-green-50 text-green-700 border-green-200",
  },
  in_stock: {
    label: "In Stock",
    icon: Clock,
    pill: "bg-blue-50 text-blue-700 border-blue-200",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    pill: "bg-yellow-50 text-yellow-700 border-yellow-200",
  },
  retired: {
    label: "Retired",
    icon: Archive,
    pill: "bg-gray-100 text-gray-600 border-gray-200",
  },
  disposed: {
    label: "Disposed",
    icon: Archive,
    pill: "bg-gray-100 text-gray-500 border-gray-200",
  },
};

function AssetStatusBadge({ status }: { status: string }) {
  const meta = (STATUS_META[status] ?? STATUS_META["deployed"])!;
  const Icon = meta.icon;
  return (
    <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

type ReportModalProps = {
  assetId: string;
  assetName: string;
  assetTag: string;
  onClose: () => void;
};

function ReportIssueModal({ assetId, assetName, assetTag, onClose }: ReportModalProps) {
  const [title, setTitle] = useState(`Issue with ${assetName}`);
  const [description, setDescription] = useState("");

  const { data: priorityList } = trpc.tickets.listPriorities.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const utils = trpc.useUtils();

  const create = trpc.tickets.create.useMutation({
    onSuccess: (ticket) => {
      toast.success(`Ticket ${(ticket as any).number} created — our team will be in touch.`);
      utils.tickets.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err?.message ?? "Failed to submit. Please try again."),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title.");
      return;
    }

    const mediumPriorityId = priorityList?.find(
      (p) => p.name.toLowerCase() === "medium",
    )?.id;

    create.mutate({
      title: title.trim(),
      description: description.trim()
        ? `**Asset:** ${assetName} (${assetTag})\n\n${description.trim()}`
        : `Issue reported with asset: ${assetName} (${assetTag})`,
      type: "incident",
      priorityId: mediumPriorityId,
      tags: ["asset-issue", assetTag.toLowerCase()],
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Report an Issue</h3>
            <p className="text-xs text-gray-500">
              {assetName} <span className="font-mono text-gray-400">({assetTag})</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700" htmlFor="issue-title">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="issue-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700" htmlFor="issue-desc">
              Description
            </label>
            <textarea
              id="issue-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue with this asset…"
              rows={4}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={create.isPending || !title.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Submit Issue
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MyAssetsPage() {
  const { currentUser, isLoadingAuth } = useRBAC();
  const [reportAsset, setReportAsset] = useState<{
    id: string;
    name: string;
    assetTag: string;
  } | null>(null);

  const { data, isLoading, isError } = trpc.assets.list.useQuery(
    { ownerId: currentUser.id, limit: 100 },
    { refetchOnWindowFocus: false, enabled: !isLoadingAuth && !!currentUser.id },
  );

  const assets = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-gray-900">My Assets</h1>
        <p className="text-xs text-gray-500">
          Equipment and devices assigned to you.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-16">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Unable to load assets. Please refresh and try again.
        </div>
      )}

      {!isLoading && !isError && assets.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <Package className="h-10 w-10 text-gray-300" />
          <div>
            <p className="text-sm font-medium text-gray-600">No assets assigned</p>
            <p className="text-xs text-gray-400">
              Equipment assigned to you will appear here.
            </p>
          </div>
          <Link
            href="/portal/request/new"
            className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90"
          >
            Request Equipment
          </Link>
        </div>
      )}

      {!isLoading && !isError && assets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {assets.map((asset: any) => (
            <div
              key={asset.id}
              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <Package className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {asset.name}
                    </p>
                    <p className="font-mono text-[11px] text-gray-400">{asset.assetTag}</p>
                  </div>
                </div>
                <AssetStatusBadge status={asset.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                {asset.location && (
                  <div>
                    <span className="block font-medium text-gray-700">Location</span>
                    <span>{asset.location}</span>
                  </div>
                )}
                {asset.vendor && (
                  <div>
                    <span className="block font-medium text-gray-700">Vendor</span>
                    <span>{asset.vendor}</span>
                  </div>
                )}
                {asset.purchaseDate && (
                  <div>
                    <span className="block font-medium text-gray-700">Purchased</span>
                    <span>{new Date(asset.purchaseDate).toLocaleDateString()}</span>
                  </div>
                )}
                {asset.warrantyExpiry && (
                  <div>
                    <span className="block font-medium text-gray-700">Warranty</span>
                    <span>
                      {new Date(asset.warrantyExpiry) < new Date() ? (
                        <span className="text-red-500">Expired</span>
                      ) : (
                        new Date(asset.warrantyExpiry).toLocaleDateString()
                      )}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() =>
                  setReportAsset({
                    id: asset.id,
                    name: asset.name,
                    assetTag: asset.assetTag,
                  })
                }
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Report Issue
              </button>
            </div>
          ))}
        </div>
      )}

      {reportAsset && (
        <ReportIssueModal
          assetId={reportAsset.id}
          assetName={reportAsset.name}
          assetTag={reportAsset.assetTag}
          onClose={() => setReportAsset(null)}
        />
      )}
    </div>
  );
}

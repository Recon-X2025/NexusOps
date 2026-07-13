"use client";

import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Upload, Loader2, File as FileIcon, X, FolderOpen, Cloud, Check } from "lucide-react";

/**
 * Universal FilePicker — drops into any page that needs an attachment.
 *
 * Modes (`mode` prop, default "upload"):
 *   - "upload"   : pick a local file → base64 (≤ 25 MB) → `documents.upload`
 *                  creates the DMS row + version + virus-scan job.
 *   - "dms"      : browse documents already in the DMS (`documents.list`) and
 *                  attach one by reference (no re-upload).
 *   - "drive"    : pick from Google Drive — requires the Google Workspace
 *   - "onedrive" : pick from OneDrive — requires the Microsoft 365 connector.
 *                  Both are rendered but disabled until the backend import flow
 *                  (Drive/Graph file-list → import-to-DMS, writing the reserved
 *                  documents.externalProvider/externalId columns) ships.
 *
 * The DMS row stays the source of truth; callers only persist the doc id.
 */

export type FilePickerMode = "upload" | "dms" | "drive" | "onedrive";

export interface FilePickerDoc {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface FilePickerProps {
  /** Which source tabs to offer. Defaults to ["upload"] (current behaviour). */
  mode?: FilePickerMode | FilePickerMode[];
  /** Where the file is being attached — drives DMS sourceType/sourceId. */
  source?: { type: string; id: string };
  classification?: "public" | "internal" | "confidential" | "restricted" | "pii";
  accept?: string;
  multiple?: boolean;
  maxSizeBytes?: number;
  onUploaded?: (doc: FilePickerDoc) => void;
  /** Fires when an existing DMS document is picked (mode="dms"). */
  onPicked?: (doc: FilePickerDoc) => void;
  className?: string;
}

const DEFAULT_MAX = 25 * 1024 * 1024;

const MODE_META: Record<FilePickerMode, { label: string; icon: typeof Upload; ready: boolean; connector?: string }> = {
  upload: { label: "Upload", icon: Upload, ready: true },
  dms: { label: "DMS", icon: FolderOpen, ready: true },
  drive: { label: "Google Drive", icon: Cloud, ready: false, connector: "Google Workspace" },
  onedrive: { label: "OneDrive", icon: Cloud, ready: false, connector: "Microsoft 365" },
};

async function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error ?? new Error("Read failed"));
    r.onload = () => {
      const result = String(r.result ?? "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    r.readAsDataURL(f);
  });
}

export function FilePicker(props: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = trpc.documents.upload.useMutation();
  const [recent, setRecent] = useState<Array<{ id: string; name: string; sizeBytes: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  const max = props.maxSizeBytes ?? DEFAULT_MAX;

  const modes: FilePickerMode[] = Array.isArray(props.mode)
    ? props.mode
    : [props.mode ?? "upload"];
  const [active, setActive] = useState<FilePickerMode>(modes[0] ?? "upload");

  // Browse existing DMS docs — only enabled when the "dms" tab is selected.
  const dmsList = trpc.documents.list.useQuery(
    { ...(props.source ? { sourceType: props.source.type, sourceId: props.source.id } : {}), limit: 25 },
    { enabled: active === "dms" },
  );

  const onFiles = async (fl: FileList | null) => {
    if (!fl) return;
    setError(null);
    for (const f of Array.from(fl)) {
      if (f.size > max) {
        setError(`${f.name} exceeds ${(max / 1_048_576).toFixed(0)}MB limit`);
        continue;
      }
      try {
        const b64 = await fileToBase64(f);
        const res = await upload.mutateAsync({
          name: f.name,
          mimeType: f.type || "application/octet-stream",
          contentBase64: b64,
          classification: props.classification ?? "internal",
          ...(props.source ? { sourceType: props.source.type, sourceId: props.source.id } : {}),
        });
        const docMeta: FilePickerDoc = {
          id: res.id,
          name: f.name,
          mimeType: f.type || "application/octet-stream",
          sizeBytes: f.size,
          sha256: res.sha256,
        };
        props.onUploaded?.(docMeta);
        setRecent((prev) => [{ id: res.id, name: f.name, sizeBytes: f.size }, ...prev].slice(0, 5));
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const meta = MODE_META[active];

  return (
    <div className={`space-y-2 ${props.className ?? ""}`}>
      {modes.length > 1 && (
        <div className="flex items-center gap-1 border-b border-slate-200">
          {modes.map((m) => {
            const mm = MODE_META[m];
            const Icon = mm.icon;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setActive(m)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-body-sm border-b-2 -mb-px ${
                  active === m
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {mm.label}
              </button>
            );
          })}
        </div>
      )}

      {active === "upload" && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-body-sm bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {upload.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Upload file
        </button>
      )}

      {active === "dms" && (
        <div className="space-y-1">
          {dmsList.isLoading && (
            <div className="flex items-center gap-1.5 text-caption text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading documents…
            </div>
          )}
          {dmsList.data && dmsList.data.length === 0 && (
            <div className="text-caption text-slate-500">No documents found.</div>
          )}
          {dmsList.data && dmsList.data.length > 0 && (
            <ul className="max-h-56 overflow-auto space-y-1">
              {dmsList.data.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() =>
                      props.onPicked?.({
                        id: d.id,
                        name: d.name,
                        mimeType: d.mimeType,
                        sizeBytes: d.sizeBytes,
                        sha256: d.sha256,
                      })
                    }
                    className="w-full flex items-center gap-2 text-caption text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-2 py-1 text-left"
                  >
                    <FileIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="flex-1">{d.name}</span>
                    <span className="text-slate-400">{(d.sizeBytes / 1024).toFixed(0)} KB</span>
                    <Check className="w-3.5 h-3.5 text-slate-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(active === "drive" || active === "onedrive") && !meta.ready && (
        <div className="text-caption text-slate-500 border border-dashed border-slate-300 rounded px-3 py-4 text-center">
          Picking from {meta.label} requires the {meta.connector} connector.
          <br />
          Connect it under Settings → Integrations to enable this source.
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        onChange={(e) => onFiles(e.target.files)}
        className="hidden"
      />
      {error && <div className="text-caption text-red-600">{error}</div>}
      {recent.length > 0 && (
        <ul className="space-y-1">
          {recent.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 text-caption text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1"
            >
              <FileIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="flex-1">{r.name}</span>
              <span className="text-slate-400">{(r.sizeBytes / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={() => setRecent((prev) => prev.filter((p) => p.id !== r.id))}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Hide"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

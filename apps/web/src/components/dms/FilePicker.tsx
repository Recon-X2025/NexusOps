"use client";

import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Upload, Loader2, File as FileIcon, X } from "lucide-react";

/**
 * Universal FilePicker — drops into any page that needs an attachment.
 * Ships a clean upload-and-link flow against the DMS:
 *   1. User picks a file
 *   2. We base64 it client-side (≤ 25 MB; chunked uploads in v1.1)
 *   3. tRPC `documents.upload` creates the row + version + virus scan job
 *   4. onUploaded fires with { id, name, mimeType, sizeBytes }
 *
 * The DMS row stays the source of truth; callers only persist the doc id.
 */

export interface FilePickerProps {
  /** Where the file is being attached — drives DMS sourceType/sourceId. */
  source?: { type: string; id: string };
  classification?: "public" | "internal" | "confidential" | "restricted" | "pii";
  accept?: string;
  multiple?: boolean;
  maxSizeBytes?: number;
  onUploaded?: (doc: {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  }) => void;
  className?: string;
}

const DEFAULT_MAX = 25 * 1024 * 1024;

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
        const docMeta = {
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

  return (
    <div className={`space-y-2 ${props.className ?? ""}`}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {upload.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        Upload file
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        onChange={(e) => onFiles(e.target.files)}
        className="hidden"
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
      {recent.length > 0 && (
        <ul className="space-y-1">
          {recent.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1"
            >
              <FileIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="truncate flex-1">{r.name}</span>
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

import * as React from "react";
import { Upload, X, FileText, ImageIcon, File, Loader2, CheckCircle } from "lucide-react";
import { cn } from "../utils";

export interface UploadedFile {
  name: string;
  size: number;
  url: string;
  type: string;
}

export interface FileUploadProps {
  /** POST endpoint that receives the multipart/form-data and returns `{ url: string }` */
  uploadEndpoint?: string;
  /** Already-uploaded files to display */
  value?: UploadedFile[];
  onChange?: (files: UploadedFile[]) => void;
  /** Accept MIME types / extensions, e.g. "image/*,.pdf" */
  accept?: string;
  multiple?: boolean;
  maxSizeMb?: number;
  className?: string;
  disabled?: boolean;
  /** If no uploadEndpoint is given the component calls this with the raw File */
  onFilePicked?: (files: File[]) => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (type === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function FileUpload({
  uploadEndpoint,
  value = [],
  onChange,
  accept,
  multiple = false,
  maxSizeMb = 10,
  className,
  disabled = false,
  onFilePicked,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFiles(files: File[]) {
    setError(null);
    for (const f of files) {
      if (f.size > maxSizeMb * 1024 * 1024) {
        setError(`${f.name} exceeds the ${maxSizeMb} MB limit.`);
        return;
      }
    }

    if (onFilePicked) {
      onFilePicked(files);
      return;
    }

    if (!uploadEndpoint) return;

    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(uploadEndpoint, { method: "POST", body: fd });
        if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
        const data = (await res.json()) as { url?: string };
        if (typeof data.url !== "string") throw new Error("Invalid upload response");
        uploaded.push({ name: file.name, size: file.size, url: data.url, type: file.type });
      }
      onChange?.([...value, ...uploaded]);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeFile(index: number) {
    const next = value.filter((_, i) => i !== index);
    onChange?.(next);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    void handleFiles(files);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    void handleFiles(files);
    e.target.value = "";
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Drop zone */}
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-sm transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
          (disabled || uploading) && "opacity-50 cursor-not-allowed",
        )}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" />
        )}
        <span className="font-medium text-foreground">
          {uploading ? "Uploading…" : "Click to upload or drag and drop"}
        </span>
        <span className="text-xs text-muted-foreground">
          {accept ? accept.split(",").join(", ") : "Any file"} · max {maxSizeMb} MB
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={onInputChange}
      />

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Uploaded files list */}
      {value.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {value.map((f, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              {fileIcon(f.type)}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate text-foreground">{f.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</p>
              </div>
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${f.name}`}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { FileSignature, FileText, Clock, Check, AlertCircle } from "lucide-react";
import { FilePicker } from "@/components/dms/FilePicker";
import { SignButton } from "./SignButton";

/**
 * Universal e-signature panel. Renders alongside any signable record:
 *   - Lists DMS documents linked to (sourceType + sourceId)
 *   - Lists existing signature requests for the same source
 *   - Lets the user upload a new doc and send it for e-signature
 *
 * Drop in next to a contract, offer letter, board resolution, policy, etc.
 */
export interface EsignPanelProps {
  sourceType: "contract" | "offer_letter" | "resolution" | "policy_ack" | "vendor_msme" | "form16";
  sourceId: string;
  /** Default title used for the envelope when sending. */
  defaultTitle: string;
  /** Default signers proposed in the SignButton dialog. */
  defaultSigners: Array<{ name: string; email: string; phone?: string; role?: string }>;
  /** Optional human-readable subject context (counterparty, candidate name, ...). */
  subject?: string;
  /** Hide the upload control if the parent already provides one. */
  hideUpload?: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "text-slate-700 bg-slate-100",
  sent: "text-blue-700 bg-blue-100",
  viewed: "text-indigo-700 bg-indigo-100",
  signed: "text-emerald-700 bg-emerald-100",
  completed: "text-emerald-800 bg-emerald-100",
  declined: "text-red-700 bg-red-100",
  expired: "text-amber-700 bg-amber-100",
  voided: "text-slate-500 bg-slate-100",
};

export function EsignPanel(props: EsignPanelProps) {
  const docs = trpc.documents.list.useQuery({
    sourceType: props.sourceType,
    sourceId: props.sourceId,
    limit: 25,
  });
  const requests = trpc.esign.list.useQuery({
    sourceType: props.sourceType,
    sourceId: props.sourceId,
    limit: 25,
  });
  const utils = trpc.useUtils();

  const docList = useMemo(() => docs.data ?? [], [docs.data]);
  const reqList = useMemo(() => requests.data ?? [], [requests.data]);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const selectedDoc = useMemo(
    () => docList.find((d) => d.id === selectedDocId) ?? docList[0] ?? null,
    [docList, selectedDocId],
  );

  return (
    <div className="bg-card border border-border rounded overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[12px] font-semibold text-foreground/80">E-signature</span>
          {reqList.length > 0 && (
            <span className="text-[11px] text-muted-foreground">({reqList.length})</span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Existing signature requests */}
        {reqList.length > 0 && (
          <ul className="space-y-1">
            {reqList.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 text-[12px] border border-border rounded px-2 py-1.5 bg-background"
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span className="truncate flex-1">{r.title}</span>
                <span className={`status-badge text-[10px] capitalize ${STATUS_STYLE[r.status] ?? "text-slate-700 bg-slate-100"}`}>
                  {r.status}
                </span>
                <span className="text-[10px] text-muted-foreground/70 font-mono">
                  {r.providerEnvelopeId ? r.providerEnvelopeId.slice(0, 8) : "—"}
                </span>
                <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(r.createdAt).toLocaleDateString("en-GB")}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Documents picker */}
        {docList.length === 0 ? (
          <div className="text-[12px] text-muted-foreground flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            No document linked yet — upload one below to enable e-sign.
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Document</div>
            <select
              value={selectedDoc?.id ?? ""}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full text-[12px] border border-border rounded px-2 py-1.5 bg-background"
            >
              {docList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · v{d.currentVersion} · {(d.sizeBytes / 1024).toFixed(0)}KB
                  {d.scanStatus === "infected" ? " · INFECTED" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-2 flex-wrap">
          {!props.hideUpload && (
            <FilePicker
              source={{ type: props.sourceType, id: props.sourceId }}
              accept="application/pdf,.pdf"
              onUploaded={() => {
                void utils.documents.list.invalidate({
                  sourceType: props.sourceType,
                  sourceId: props.sourceId,
                });
              }}
            />
          )}
          {selectedDoc && selectedDoc.scanStatus !== "infected" && (
            <SignButton
              sourceType={props.sourceType}
              sourceId={props.sourceId}
              title={props.defaultTitle}
              documentStorageKey={selectedDoc.storageKey}
              documentSha256={selectedDoc.sha256}
              signers={props.defaultSigners}
              onSent={() => {
                void utils.esign.list.invalidate({
                  sourceType: props.sourceType,
                  sourceId: props.sourceId,
                });
              }}
            />
          )}
        </div>

        {props.subject && (
          <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1 pt-1 border-t border-border">
            <Check className="w-3 h-3" />
            Linked to: <span className="font-medium text-muted-foreground">{props.subject}</span>
          </div>
        )}
      </div>
    </div>
  );
}

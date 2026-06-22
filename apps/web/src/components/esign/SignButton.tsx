"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, FileSignature, Check } from "lucide-react";

/**
 * Universal SignButton — drops into any page that has a document worth
 * signing. The caller passes the source identifier (sourceType + sourceId)
 * and the underlying document storage info; SignButton creates a signature
 * envelope and surfaces signer URLs.
 *
 * Wired call-sites (initial): contracts, recruitment.offers, secretarial.resolutions,
 * hr.policies, procurement.vendor-onboarding, payroll.form16.
 */
export interface SignButtonProps {
  sourceType: string;
  sourceId: string;
  title: string;
  documentStorageKey: string;
  documentSha256: string;
  signers: Array<{ name: string; email: string; phone?: string; role?: string }>;
  message?: string;
  expiresAt?: string;
  provider?: "emudhra" | "docusign";
  onSent?: (envelopeId: string) => void;
  className?: string;
}

export function SignButton(props: SignButtonProps) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ envelopeId: string; signingUrls: Array<{ email: string; url: string }> } | null>(
    null,
  );
  const create = trpc.esign.createRequest.useMutation();

  const send = async () => {
    const res = await create.mutateAsync({
      sourceType: props.sourceType,
      sourceId: props.sourceId,
      title: props.title,
      documentStorageKey: props.documentStorageKey,
      documentSha256: props.documentSha256,
      signers: props.signers,
      provider: props.provider ?? "emudhra",
      ...(props.message ? { message: props.message } : {}),
      ...(props.expiresAt ? { expiresAt: props.expiresAt } : {}),
    });
    setDone(res);
    props.onSent?.(res.envelopeId);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={create.isPending}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 ${
          props.className ?? ""
        }`}
      >
        <FileSignature className="w-4 h-4" />
        Send for e-sign
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5">
            <div className="font-semibold text-slate-900 mb-1">Send for e-signature</div>
            <div className="text-sm text-slate-600 mb-4">{props.title}</div>

            {done ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <Check className="w-4 h-4" />
                  Envelope sent — id {done.envelopeId.slice(0, 12)}…
                </div>
                <div className="text-xs text-slate-500">
                  Signers will receive an email with their unique signing link. Internal preview links:
                </div>
                <div className="space-y-1">
                  {done.signingUrls.map((s) => (
                    <div key={s.email} className="text-xs flex items-center justify-between gap-2">
                      <span className="font-mono">{s.email}</span>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Open
                      </a>
                    </div>
                  ))}
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => {
                      setOpen(false);
                      setDone(null);
                    }}
                    className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Signers</div>
                <ul className="text-sm text-slate-800 space-y-0.5 mb-4">
                  {props.signers.map((s) => (
                    <li key={s.email}>
                      {s.name} <span className="text-slate-500">({s.email})</span>
                      {s.role ? <span className="text-slate-400"> — {s.role}</span> : null}
                    </li>
                  ))}
                </ul>
                <div className="text-xs text-slate-500 mb-4">
                  Provider:{" "}
                  <span className="font-medium text-slate-700">{props.provider ?? "emudhra"}</span> ·
                  IT Act §3A compliant. Audit trail will be retained 8 years.
                </div>
                {create.error && (
                  <div className="text-sm text-red-600 mb-2">{create.error.message}</div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    disabled={create.isPending}
                    className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={send}
                    disabled={create.isPending}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded inline-flex items-center gap-1.5"
                  >
                    {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Send envelope
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

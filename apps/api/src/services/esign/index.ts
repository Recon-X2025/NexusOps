import type { EsignProvider } from "./types";
import { emudhraProvider } from "./emudhra";
import { docusignProvider } from "./docusign";

export * from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const providers: Record<string, EsignProvider<any>> = {
  emudhra: emudhraProvider,
  docusign: docusignProvider,
};

/**
 * Providers that actually have an implementation and may be offered to callers.
 * Kept as a precise literal tuple (matching the DB esign_provider enum members)
 * so the API can never advertise an unimplemented provider again. Adding a new
 * adapter above requires adding it here too.
 */
export const IMPLEMENTED_ESIGN_PROVIDERS = ["emudhra", "docusign"] as const;

// Compile-time guard: every advertised provider must be registered above.
const _assertRegistered: Record<
  (typeof IMPLEMENTED_ESIGN_PROVIDERS)[number],
  true
> = { emudhra: true, docusign: true };
void _assertRegistered;

export type SupportedEsignProvider = keyof typeof providers;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEsignProvider(name: string): EsignProvider<any> | null {
  return providers[name] ?? null;
}

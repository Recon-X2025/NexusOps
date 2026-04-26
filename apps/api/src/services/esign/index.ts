import type { EsignProvider } from "./types";
import { emudhraProvider } from "./emudhra";

export * from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const providers: Record<string, EsignProvider<any>> = {
  emudhra: emudhraProvider,
};

export type SupportedEsignProvider = keyof typeof providers;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEsignProvider(name: string): EsignProvider<any> | null {
  return providers[name] ?? null;
}

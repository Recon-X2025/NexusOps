export { pageHasCrash } from "../full-qa/helpers";

/** Console noise common in local dev — does not indicate app bug. */
export function isBenignConsoleMessage(text: string): boolean {
  if (/favicon|ResizeObserver|Download the React DevTools/i.test(text)) return true;
  if (/Failed to load resource.*404|net::ERR_|ChunkLoadError|Loading chunk \d+ failed/i.test(text))
    return true;
  if (/^\[Fast Refresh\]/i.test(text)) return true;
  return false;
}

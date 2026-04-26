/**
 * Integration adapter contract — every connector implements this.
 *
 * The integrations tRPC router resolves an adapter by `provider` and
 * dispatches calls. Configs are stored encrypted (see ../encryption.ts);
 * adapters never touch the encrypted blob directly — they receive a
 * decrypted, typed config object.
 */
export interface AdapterCapabilities {
  /** Adapter can send outbound messages / requests. */
  send: boolean;
  /** Adapter can receive inbound webhooks. */
  receive: boolean;
  /** Adapter performs an OAuth dance for setup. */
  oauth: boolean;
}

export interface AdapterTestResult {
  ok: boolean;
  details?: string;
}

export interface WebhookEnvelope {
  /** Coarse classification — adapter-defined. e.g. "message.inbound", "payment.captured". */
  kind: string;
  /** Adapter-normalised payload. Caller picks what to do with it. */
  payload: unknown;
  /** Provider-side reference id for idempotency. */
  providerRef?: string;
}

export interface IntegrationAdapter<TConfig = Record<string, string>, TMessage = unknown> {
  provider: string;
  displayName: string;
  capabilities: AdapterCapabilities;

  /** Validate the config against the live provider — used by integrations.test(). */
  test(config: TConfig): Promise<AdapterTestResult>;

  /** Send a message / request. Throws on transport error. */
  send?(config: TConfig, message: TMessage): Promise<{ providerRef: string; raw?: unknown }>;

  /** Verify + parse an inbound webhook. Throws on signature failure. */
  receiveWebhook?(
    config: TConfig,
    body: string,
    headers: Record<string, string>,
  ): Promise<WebhookEnvelope>;

  /**
   * Begin an OAuth dance — returns the URL to redirect the user to.
   * The orgId + redirectUri are stamped into `state` to prevent CSRF.
   */
  beginOAuth?(args: { orgId: string; state: string; redirectUri: string }): string;

  /** Exchange the OAuth callback code for tokens; returns the config to encrypt + store. */
  completeOAuth?(args: { code: string; redirectUri: string }): Promise<TConfig>;
}

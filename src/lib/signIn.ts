/**
 * Signing in to the member's own Pryv account: a standard Pryv auth request.
 *
 * 1. `Service.startAccessRequest` posts the request; the platform answers
 *    with its auth page (`authUrl`) and a poll URL.
 * 2. The member answers on the auth page, opened in a pop-up (or a tab).
 * 3. The app polls until the request is accepted or refused, then resolves
 *    the request's key into a `Connection` (`connectFromKey`, which redeems
 *    the one-time credential hand-off).
 *
 * What the app asks for, on the member's OWN account, is the minimum the
 * group-accounts guide gives for a member app: `read` on `:_cmc:inbox` (the
 * group's acceptance of a membership arrives there, with the membership's
 * endpoint) and `contribute` on the app's scope `:_cmc:apps:<appCode>` (where
 * membership requests are written).
 */
import { Pryv, type Connection, type Service } from "./pryvClient";
import type { AppConfig } from "./config";

export class SignInError extends Error {
  readonly id: "sign-in-refused" | "sign-in-timeout";
  constructor(id: "sign-in-refused" | "sign-in-timeout") {
    super(id);
    this.name = "SignInError";
    this.id = id;
  }
}

export interface StartedSignIn {
  key: string;
  authUrl: string;
  poll: string;
  pollRateMs: number;
}

/** The auth request this app sends. */
export function authRequest(config: AppConfig, languageCode: string) {
  return {
    requestingAppId: config.requestingAppId,
    languageCode,
    requestedPermissions: [
      { streamId: ":_cmc:inbox", level: "read" as const, defaultName: "Messaging inbox" },
      { streamId: `:_cmc:apps:${config.appCode}`, level: "contribute" as const, defaultName: config.appName },
    ],
    credentialHandoff: "shared-secret" as const,
  };
}

export function newService(serviceInfoUrl: string): Service {
  return new Pryv.Service(serviceInfoUrl);
}

export async function startSignIn(service: Service, config: AppConfig, languageCode: string): Promise<StartedSignIn> {
  const started = await service.startAccessRequest(authRequest(config, languageCode));
  return { key: started.key, authUrl: started.authUrl, poll: started.poll, pollRateMs: started.pollRateMs };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  });
}

/**
 * Poll the request until it is decided. Resolves with the member's
 * connection; rejects with `SignInError` (refused, timed out) or an
 * `AbortError` when `signal` aborts.
 */
export async function waitForSignIn(
  service: Service,
  started: StartedSignIn,
  opts: { signal?: AbortSignal; timeoutMs?: number; minIntervalMs?: number } = {},
): Promise<Connection> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const interval = Math.max(opts.minIntervalMs ?? 1000, started.pollRateMs || 0);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const body = (await service.pollAccessRequest(started.poll)) as { status?: string } | null;
    if (body?.status === "ACCEPTED") return service.connectFromKey(started.key);
    if (body?.status === "REFUSED") throw new SignInError("sign-in-refused");
    if (Date.now() + interval > deadline) throw new SignInError("sign-in-timeout");
    await sleep(interval, opts.signal);
  }
}

/** `username` of a connection's account, from its access info. */
export async function usernameOf(connection: Connection): Promise<string> {
  const info = (await connection.accessInfo()) as { user?: { username?: string } };
  const username = info?.user?.username;
  if (typeof username !== "string" || username.length === 0) {
    throw Object.assign(new Error("access-info without a username"), { id: "invalid-access-token" });
  }
  return username;
}

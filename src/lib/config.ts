/**
 * Deployment configuration.
 *
 * Read once at boot from `settings.json`, served next to the bundle; each key
 * falls back to the build-time environment (`VITE_*`, see `.env.example`),
 * then to the default below. The page address may name the platform
 * (`?pryvServiceInfoUrl=`), over both (see `withAddressPlatform`). Nothing here is a secret: the app holds no
 * credential of its own.
 *
 *   {
 *     "serviceInfoUrl": "https://reg.example.com/service/info",
 *     "allowedServiceInfoUrls": [],
 *     "accountAppUrl": "https://account.example.com/",
 *     "appCode": "practice",
 *     "appName": "Practice",
 *     "group": { "username": "practice", "host": "example.com" },
 *     "teams": [{ "streamId": ":_cmc:apps:practice:team-a", "name": "Team A" }],
 *     "invite": {
 *       "displayName": "The practice",
 *       "permissions": [{ "streamId": "diary", "level": "read" }],
 *       "consent": { "en": "Your care team reads your diary, each member under their own name." }
 *     },
 *     "memberAccessTtl": 3600
 *   }
 */

export interface TeamSetting {
  streamId: string;
  name: string;
}

export interface InviteSettings {
  /** How the group is named to the patient. Default: the app name. */
  displayName: string;
  /** What a patient invite asks for. */
  permissions: Array<{ streamId: string; level: "read" | "contribute" }>;
  consent: Record<string, string> | null;
}

export interface AppConfig {
  /** The member's platform (`service/info`). Required. */
  serviceInfoUrl: string | null;
  /**
   * When set, the only platforms a page address may name (with
   * `serviceInfoUrl`, always allowed). A link naming another one is refused.
   * Null (key absent): any platform. Read from `settings.json` only.
   */
  allowedServiceInfoUrls: string[] | null;
  /** The page address named a platform this deployment does not serve. */
  platformRefused: boolean;
  /**
   * Base URL of the group platform's account app (app-web-user-account).
   * The membership QR code opens `<accountAppUrl>account/memberships`. Query
   * parameters of the base are kept. Null: derived from the sign-in page.
   */
  accountAppUrl: string | null;
  /** CMC app code: the app's scope stream is `:_cmc:apps:<appCode>`. */
  appCode: string;
  /** Shown in the header and the sign-in request. */
  appName: string;
  /** `requestingAppId` of the sign-in request. */
  requestingAppId: string;
  /** Pre-fills the join form. */
  group: { username: string; host: string } | null;
  /** Team streams offered in the join form; empty: typed by the member. */
  teams: TeamSetting[];
  invite: InviteSettings;
  /** Lifetime, in seconds, asked for each member access on a patient. */
  memberAccessTtl: number;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const DEFAULT_CONFIG: AppConfig = {
  serviceInfoUrl: null,
  allowedServiceInfoUrls: null,
  platformRefused: false,
  accountAppUrl: null,
  appCode: "group-member",
  appName: "Group member",
  requestingAppId: "app-web-group-member",
  group: null,
  teams: [],
  invite: {
    displayName: "Group member",
    permissions: [{ streamId: "diary", level: "read" }],
    consent: null,
  },
  memberAccessTtl: 3600,
};

let current: AppConfig = DEFAULT_CONFIG;

/** The configuration in force. */
export function getConfig(): AppConfig {
  return current;
}

/** Test hook. */
export function _setConfigForTest(c: Partial<AppConfig> | null): void {
  current = c == null ? DEFAULT_CONFIG : { ...DEFAULT_CONFIG, ...c };
}

function str(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

/** An absolute http(s) URL, or undefined. */
export function httpUrl(raw: unknown): string | undefined {
  const value = str(raw);
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function actor(raw: unknown): { username: string; host: string } | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const username = str(o.username);
  const host = str(o.host);
  return username && host ? { username, host } : undefined;
}

/** `:_cmc:apps:<app>[:<path>]`, outside the plugin's chats and collectors. */
export function isTeamStreamId(id: unknown): id is string {
  if (typeof id !== "string" || !id.startsWith(":_cmc:apps:")) return false;
  const parts = id.slice(":_cmc:apps:".length).split(":");
  if (parts.some((p) => p.length === 0)) return false;
  return !parts.slice(1).some((p) => p === "chats" || p === "collectors");
}

/** Team stream ids typed by the member, one per line or comma-separated. */
export function parseTeamIds(text: string): { ids: string[]; invalid: string[] } {
  const parts = text.split(/[\s,]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) (isTeamStreamId(p) ? ids : invalid).push(p);
  return { ids: [...new Set(ids)], invalid };
}

function teams(raw: unknown): TeamSetting[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: TeamSetting[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (!isTeamStreamId(o.streamId)) continue;
    out.push({ streamId: o.streamId, name: str(o.name) ?? o.streamId });
  }
  return out;
}

function invite(raw: unknown, appName: string): InviteSettings {
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const permissions: InviteSettings["permissions"] = [];
  if (Array.isArray(o.permissions)) {
    for (const p of o.permissions) {
      if (typeof p !== "object" || p === null) continue;
      const q = p as Record<string, unknown>;
      const streamId = str(q.streamId);
      if (!streamId || streamId.startsWith(":_cmc:")) continue;
      permissions.push({ streamId, level: q.level === "contribute" ? "contribute" : "read" });
    }
  }
  let consent: Record<string, string> | null = null;
  if (typeof o.consent === "object" && o.consent !== null) {
    const entries = Object.entries(o.consent as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    );
    if (entries.length > 0) consent = Object.fromEntries(entries);
  }
  return {
    displayName: str(o.displayName) ?? appName,
    permissions: permissions.length > 0 ? permissions : DEFAULT_CONFIG.invite.permissions,
    consent,
  };
}

/** The build-time environment, as `settings.json` keys. */
export function envSettings(env: Record<string, string | undefined>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (env.VITE_SERVICE_INFO_URL) out.serviceInfoUrl = env.VITE_SERVICE_INFO_URL;
  if (env.VITE_ACCOUNT_APP_URL) out.accountAppUrl = env.VITE_ACCOUNT_APP_URL;
  if (env.VITE_APP_CODE) out.appCode = env.VITE_APP_CODE;
  if (env.VITE_APP_NAME) out.appName = env.VITE_APP_NAME;
  return out;
}

/**
 * Narrow an untrusted settings body (with the environment as fallback) onto
 * `AppConfig`. Invalid values are dropped, never guessed.
 */
export function parseConfig(raw: unknown, env: Record<string, unknown> = {}): AppConfig {
  const file = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pick = (key: string): unknown => (file[key] !== undefined ? file[key] : env[key]);
  const appCodeRaw = str(pick("appCode"));
  const appCode = appCodeRaw && SLUG.test(appCodeRaw) ? appCodeRaw : DEFAULT_CONFIG.appCode;
  const appName = str(pick("appName")) ?? DEFAULT_CONFIG.appName;
  const ttl = pick("memberAccessTtl");
  return {
    serviceInfoUrl: httpUrl(pick("serviceInfoUrl")) ?? null,
    // Kept even when empty: a restriction that parses to nothing means "the
    // default platform only", never "no restriction" (fail closed).
    allowedServiceInfoUrls: Array.isArray(file.allowedServiceInfoUrls)
      ? file.allowedServiceInfoUrls.map(httpUrl).filter((u): u is string => u != null)
      : null,
    platformRefused: false,
    accountAppUrl: httpUrl(pick("accountAppUrl")) ?? null,
    appCode,
    appName,
    requestingAppId: str(pick("requestingAppId")) ?? DEFAULT_CONFIG.requestingAppId,
    group: actor(pick("group")) ?? null,
    teams: teams(pick("teams")) ?? [],
    invite: invite(pick("invite"), appName),
    memberAccessTtl:
      typeof ttl === "number" && Number.isInteger(ttl) && ttl >= 60 ? ttl : DEFAULT_CONFIG.memberAccessTtl,
  };
}

/** Query parameter naming the platform, as for app-web-user-account. */
export const SERVICE_INFO_URL_PARAM = "pryvServiceInfoUrl";

/**
 * The platform named by the page address (`?pryvServiceInfoUrl=`), when it is
 * an absolute http(s) URL; otherwise undefined.
 */
export function serviceInfoUrlFromSearch(search: string): string | undefined {
  return httpUrl(new URLSearchParams(search).get(SERVICE_INFO_URL_PARAM));
}

/**
 * The configuration with the platform the page address names, if it names a
 * valid one: the address wins over `settings.json`, which wins over the
 * environment. An invalid value is ignored. The value only says where to
 * fetch the service info from; nothing else in the configuration comes from
 * the address (the display language's `?lang=` is read by i18n.ts).
 *
 * A platform outside `allowedServiceInfoUrls` (when set) is refused: no
 * platform is used, not even the default, and the sign-in page says the
 * link names a platform this deployment does not serve.
 */
export function withAddressPlatform(config: AppConfig, search: string): AppConfig {
  const fromAddress = serviceInfoUrlFromSearch(search);
  if (!fromAddress) return config;
  if (!isAllowedServiceInfoUrl(config, fromAddress)) return { ...config, serviceInfoUrl: null, platformRefused: true };
  return { ...config, serviceInfoUrl: fromAddress };
}

/** Whether two URL strings name the same URL once normalised. */
export function sameUrl(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return false;
  }
}

/**
 * Whether this deployment may talk to the platform at `serviceInfoUrl`.
 * Always true unless `allowedServiceInfoUrls` is set; then only those and the
 * default `serviceInfoUrl` are allowed (an empty list: the default only).
 */
export function isAllowedServiceInfoUrl(config: AppConfig, serviceInfoUrl: string): boolean {
  const allowed = config.allowedServiceInfoUrls;
  if (!allowed) return true;
  const candidates = config.serviceInfoUrl ? [...allowed, config.serviceInfoUrl] : allowed;
  return candidates.some((c) => sameUrl(c, serviceInfoUrl));
}

/** Longest wait for `settings.json` before rendering with the environment alone. */
export const BOOT_FETCH_TIMEOUT_MS = 4000;

/** Fetch `settings.json` and set the configuration. Never throws. */
export async function loadConfig(fetchImpl: typeof fetch = fetch): Promise<AppConfig> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOOT_FETCH_TIMEOUT_MS);
  let body: unknown = null;
  try {
    const response = await fetchImpl(`${import.meta.env.BASE_URL}settings.json`, {
      cache: "no-cache",
      signal: controller.signal,
    });
    body = response.ok ? await response.json() : null;
  } catch {
    body = null;
  } finally {
    clearTimeout(timer);
  }
  current = withAddressPlatform(
    parseConfig(body, envSettings(import.meta.env as Record<string, string | undefined>)),
    window.location.search,
  );
  return current;
}

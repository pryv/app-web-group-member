/**
 * Error ids from the Pryv client libraries, turned into messages people can
 * read.
 *
 * `@pryv/cmc` throws a `CmcError` with the id on `id` (a refusal answered by
 * the server, the reason recorded on a trigger, or a client-side check).
 * `pryv` throws a `PryvError` whose API error sits in `innerObject` (with a
 * plugin's specific id under `innerObject.data.id`). Messages from the
 * libraries are never shown or logged as they are: an older client embedded a
 * call's parameters (which may carry a token-bearing URL) in them.
 */

/** Ids with a catalogued message (`errors.<id>` in the locale files). */
export const KNOWN_ERROR_IDS = [
  // Membership request and acceptance
  "cmc-membership-permissions-invalid",
  "cmc-capability-invalid",
  "cmc-capability-timeout",
  "cmc-capability-consumed",
  "cmc-capability-invalidated",
  // Member access, refused when written
  "cmc-member-access-not-member",
  "cmc-member-access-relationship-not-found",
  "cmc-member-access-scope-outside-membership",
  "cmc-member-access-permissions-not-subset",
  "cmc-member-access-expiry-out-of-range",
  "cmc-member-access-rate-limited",
  "cmc-member-access-in-flight",
  "cmc-member-stamp-invalid",
  // Member access, recorded on the trigger
  "cmc-member-access-grant-not-delegable",
  "cmc-member-access-peer-rejected",
  "cmc-member-access-peer-unreachable",
  "cmc-member-access-membership-gone",
  "cmc-member-access-not-retryable",
  "cmc-member-channel-not-supported",
  // Client-side
  "cmc-member-access-unsupported",
  "cmc-member-access-token-missing",
  // Invites
  "cmc-offer-invalid-access-type",
  "cmc-offer-invalid-permissions",
  "cmc-offer-empty-permissions",
  // Platform
  "invalid-access-token",
  "forbidden",
  "unknown-resource",
  "unknown-referenced-resource",
  "invalid-parameters-format",
  // This app
  "sign-in-refused",
  "sign-in-timeout",
  "sign-in-popup-blocked",
  "network",
] as const;

export type KnownErrorId = (typeof KNOWN_ERROR_IDS)[number];

/** The error ids this app retries by itself, shortly after: the request is worth asking again. */
export const RETRY_SHORTLY_IDS: readonly string[] = [
  "cmc-member-access-in-flight",
  "cmc-member-access-peer-unreachable",
];

function field(value: unknown, key: string): unknown {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** The most specific error id an error carries, or null. */
export function errorId(err: unknown): string | null {
  const inner = field(err, "innerObject");
  const candidates = [field(err, "id"), field(field(inner, "data"), "id"), field(inner, "id"), field(field(err, "data"), "id")];
  // A `cmc-*` id is the most specific; then any other id.
  const cmc = candidates.find((c) => nonEmpty(c) && c.startsWith("cmc-"));
  if (nonEmpty(cmc)) return cmc;
  const any = candidates.find(nonEmpty);
  if (nonEmpty(any)) return any;
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return "network";
  return null;
}

export function isKnownErrorId(id: string | null): id is KnownErrorId {
  return id != null && (KNOWN_ERROR_IDS as readonly string[]).includes(id);
}

/** What to show for an error: a catalogued message key, and the raw id for support when it is not catalogued. */
export function describeError(err: unknown): { key: string; id: string | null } {
  const id = errorId(err);
  if (isKnownErrorId(id)) return { key: `errors.${id}`, id };
  return { key: "errors.generic", id };
}

/**
 * `text` with every URL and `userinfo@host` part replaced: for a log line.
 * Linear time on hostile input (bounded quantifiers, input cut first).
 */
export function redactUrls(text: string): string {
  return text
    .slice(0, 2000)
    .replace(/[a-z][a-z0-9+.-]{0,31}:\/\/[^\s"'<>]*/gi, "<url>")
    .replace(/[^\s"'<>@/:]{1,512}@[a-z0-9-][^\s"'<>]*/gi, "<redacted>")
    .slice(0, 300);
}

/** A one-line description of an error that is safe to log: its id, never its message. */
export function loggableError(err: unknown): string {
  const id = errorId(err);
  return id != null ? redactUrls(id) : "unidentified error";
}

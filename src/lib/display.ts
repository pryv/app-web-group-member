/**
 * Display helpers: dates, event contents, credential masking.
 *
 * In Pryv an API endpoint carries its token in the URL's user part
 * (`https://<token>@<host>/`). Anything printed from data (event contents,
 * error ids) has the user part of every URL masked, so a screenshot or a
 * screen share does not carry a token.
 */

export const CREDENTIAL_MASK = "***";

const EMBEDDED_USERINFO = /([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/?#@"'<>]{1,512}@/gi;
const ENCODED_USERINFO = /([a-z][a-z0-9+.-]{0,31}%3a%2f%2f)(?:(?!%40|%2f|%3f|%23)[^\s&"'<>]){1,512}%40/gi;

/** `value` with the user part of every URL in it masked. */
export function maskUrlCredentials(value: string): string {
  if (!value.includes("@") && !/%40/i.test(value)) return value;
  return value.replace(EMBEDDED_USERINFO, "$1" + CREDENTIAL_MASK + "@").replace(ENCODED_USERINFO, "$1" + CREDENTIAL_MASK + "%40");
}

/** A short, masked, one-line rendering of an event's content. */
export function contentSummary(content: unknown, max = 160): string {
  let text: string;
  if (content == null) text = "";
  else if (typeof content === "string") text = content;
  else if (typeof content === "number" || typeof content === "boolean") text = String(content);
  else {
    try {
      text = JSON.stringify(content);
    } catch {
      text = "";
    }
  }
  text = maskUrlCredentials(text);
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/** A date and time from Pryv seconds, in the reader's locale. */
export function formatTime(seconds: number | null | undefined, locale?: string): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
  return new Date(seconds * 1000).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function actorLabel(a: { username: string; host: string } | null | undefined): string {
  return a ? `${a.username}@${a.host}` : "";
}

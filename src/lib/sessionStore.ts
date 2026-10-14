/**
 * The browser session: the one credential this app keeps.
 *
 * The member's access to their own account is kept in `sessionStorage` (this
 * tab only, gone when it closes). Nothing else that carries a token is ever
 * written to storage or to the address: the membership endpoint is read again
 * from the member's inbox on each visit, and a member access on a patient
 * lives in memory for the page that uses it.
 */

export const SESSION_KEY = "app-web-group-member.session";

export interface StoredSession {
  apiEndpoint: string;
  serviceInfoUrl: string;
  /** The auth page the member signed in on (no query): locates the account app. */
  authUrl: string | null;
}

export function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.apiEndpoint !== "string" || typeof parsed.serviceInfoUrl !== "string") return null;
    return {
      apiEndpoint: parsed.apiEndpoint,
      serviceInfoUrl: parsed.serviceInfoUrl,
      authUrl: typeof parsed.authUrl === "string" ? parsed.authUrl : null,
    };
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked: the session holds for this page only.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // nothing stored
  }
}

/** An auth page URL without its query and fragment (they may carry a request key). */
export function stripQuery(url: string): string | null {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

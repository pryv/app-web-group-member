/**
 * Links handed over by the member: the membership request to a group
 * administrator, and a patient invite to the patient.
 *
 * Each goes to the account app (app-web-user-account) of the platform that
 * answers it, which reads the capability URL, signs the person in and shows
 * the request. The bare capability URL is always printed as well, for the
 * paste path.
 *
 * The membership link carries `capabilityUrl` only: where the group files the
 * membership is the administrator's page's decision, derived from the
 * request, never a parameter of the link.
 */

/** `<base><path>`, keeping the base's own query parameters, plus `params`. */
export function accountAppLink(base: string, path: string, params: Record<string, string>): string | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const basePath = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
  url.pathname = basePath + path.replace(/^\/+/, "");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.hash = "";
  return url.toString();
}

/** The QR target for a membership request: `<accountApp>account/memberships?capabilityUrl=<link>`. */
export function membershipLink(accountAppUrl: string | null, capabilityUrl: string): string | null {
  if (accountAppUrl == null) return null;
  return accountAppLink(accountAppUrl, "account/memberships", { capabilityUrl });
}

/**
 * The patient's link for an invite: the account app's `/cmc-accept` page,
 * where the patient answers with their own account. `scopeStreamId` is the
 * stream on the PATIENT's account where the answer is recorded.
 */
export function inviteLink(accountAppUrl: string | null, capabilityUrl: string, scopeStreamId: string): string | null {
  if (accountAppUrl == null) return null;
  return accountAppLink(accountAppUrl, "cmc-accept", { capabilityUrl, scopeStreamId });
}

/**
 * The account-app base the links use: the configured one; else the one next
 * to the page the member signed in on, told which platform it serves
 * (`pryvServiceInfoUrl`, the member's own: a group on the same platform).
 */
export function resolveAccountApp(
  configured: string | null,
  signInAuthUrl: string | null | undefined,
  serviceInfoUrl: string | null,
): string | null {
  if (configured != null) return configured;
  const derived = accountAppFromAuthUrl(signInAuthUrl);
  if (derived == null) return null;
  return serviceInfoUrl != null ? accountAppLink(derived, "", { pryvServiceInfoUrl: serviceInfoUrl }) : derived;
}

/**
 * The account app next to a sign-in page, as the `pryv` sign-in button
 * derives it: the auth page URL without its trailing `/auth` segment and
 * query. Null when the URL does not have that shape.
 */
export function accountAppFromAuthUrl(authUrl: string | null | undefined): string | null {
  if (typeof authUrl !== "string") return null;
  let url: URL;
  try {
    url = new URL(authUrl);
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/auth")) return null;
  return url.origin + path.slice(0, -"auth".length);
}

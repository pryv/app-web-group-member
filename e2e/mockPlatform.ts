import type { BrowserContext, Route } from "@playwright/test";

/**
 * A mocked Pryv platform for the E2E specs, over the wire: the real `pryv`
 * and `@pryv/cmc` clients run in the page against it.
 *
 *   bob.example.test       the member's own core
 *   practice.example.test  the group's core (reached through the membership)
 *   pat.example.test       a patient's core (reached through a member access)
 *
 * Every core response carries `meta` (the client refuses one without it).
 */

export const META = { apiVersion: "2.0.0", serverTime: 1789560000, serial: "1" };
export const NOW = Math.floor(Date.now() / 1000);
export const SERVICE_INFO_URL = "https://reg.example.test/service/info";
export const SERVICE_INFO = {
  register: "https://reg.example.test/",
  access: "https://reg.example.test/access/",
  api: "https://{username}.example.test/",
  name: "Test platform",
  serial: "1",
};
export const SETTINGS = {
  serviceInfoUrl: SERVICE_INFO_URL,
  accountAppUrl: "https://account.example.test/",
  appCode: "demo",
  appName: "Demo practice",
  group: { username: "practice", host: "example.test" },
  teams: [{ streamId: ":_cmc:apps:demo:team-a", name: "Team A" }],
  invite: { displayName: "Demo practice", permissions: [{ streamId: "diary", level: "read" }] },
  memberAccessTtl: 900,
};

export const MEMBER_ENDPOINT = "https://member-token@bob.example.test/";
export const MEMBERSHIP_ENDPOINT = "https://membership-token@practice.example.test/";
export const CHILD_ENDPOINT = "https://child-token@pat.example.test/";
export const PRACTICE = { username: "practice", host: "example.test" };
export const TEAM_A = ":_cmc:apps:demo:team-a";

type Ev = { id: string; time: number; streamIds: string[]; type?: string; content: Record<string, unknown> };
export interface CoreCall {
  host: string;
  method: string;
  params: Record<string, unknown>;
}

export interface Platform {
  requests: Ev[];
  accepts: Ev[];
  groupInvites: Ev[];
  calls: CoreCall[];
  /** The sign-in poll answers NEED_SIGNIN this many times before ACCEPTED. */
  pollsBeforeAccept: number;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
}

function under(e: Ev, stream: string): boolean {
  return e.streamIds.some((s) => s === stream || s.startsWith(stream + ":"));
}

export function acceptedRequest(id = "r1"): Ev {
  return {
    id,
    time: NOW - 100,
    streamIds: [":_cmc:apps:demo"],
    type: "consent/request-cmc",
    content: { status: "accepted", acceptedBy: PRACTICE, backChannelAccessId: "bc1", request: { membership: true, permissions: [{ streamId: TEAM_A, level: "contribute" }] } },
  };
}

export function membershipAccept(inviteEventId: string): Ev {
  return {
    id: "acc-" + inviteEventId,
    time: NOW,
    streamIds: [":_cmc:inbox"],
    type: "consent/accept-cmc",
    content: { from: PRACTICE, requesterAppCode: "demo", inviteEventId, membership: true, grantedAccess: { apiEndpoint: MEMBERSHIP_ENDPOINT } },
  };
}

export async function mockPlatform(context: BrowserContext, initial: Partial<Platform> = {}): Promise<Platform> {
  const p: Platform = {
    requests: [],
    accepts: [],
    groupInvites: [
      { id: "i1", time: NOW - 80, streamIds: [TEAM_A], content: { status: "accepted", acceptedBy: { username: "pat", host: "example.test" }, acceptedAt: NOW - 70 } },
    ],
    calls: [],
    pollsBeforeAccept: 1,
    ...initial,
  };

  // Anything not mocked below is refused instead of reaching the network.
  await context.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());
  await context.route("**/settings.json", (route) => json(route, SETTINGS));
  await context.route(SERVICE_INFO_URL, (route) => json(route, SERVICE_INFO));

  // Sign-in: the access request, its auth page, its poll.
  let polls = 0;
  await context.route("https://reg.example.test/access/", (route) =>
    json(route, {
      status: "NEED_SIGNIN",
      key: "k1",
      authUrl: "https://account.example.test/auth?key=k1",
      poll: "https://reg.example.test/access/k1",
      poll_rate_ms: 100,
    }),
  );
  await context.route("https://reg.example.test/access/k1", (route) =>
    json(
      route,
      polls++ < p.pollsBeforeAccept
        ? { status: "NEED_SIGNIN", key: "k1" }
        : { status: "ACCEPTED", key: "k1", username: "bob", apiEndpoint: MEMBER_ENDPOINT },
    ),
  );
  await context.route("https://account.example.test/auth**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Auth</title><p>Mock auth page</p>" }),
  );

  const accessInfo: Record<string, unknown> = {
    "bob.example.test": { type: "app", name: "group-member", user: { username: "bob" }, permissions: [] },
    "practice.example.test": {
      type: "shared",
      user: { username: "practice" },
      permissions: [{ streamId: TEAM_A, level: "contribute" }, { streamId: ":_cmc:inbox", level: "create-only" }],
    },
    "pat.example.test": { type: "shared", user: { username: "pat" }, permissions: [{ streamId: "diary", level: "read" }] },
  };

  for (const host of Object.keys(accessInfo)) {
    await context.route(`https://${host}/access-info`, (route) => json(route, { meta: META, ...(accessInfo[host] as object) }));
    await context.route(`https://${host}/`, (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
      const calls = (route.request().postDataJSON() ?? []) as Array<{ method: string; params: Record<string, unknown> }>;
      const results = calls.map((c) => {
        p.calls.push({ host, method: c.method, params: c.params });
        return answer(p, host, c.method, c.params ?? {});
      });
      return json(route, { meta: META, results });
    });
  }
  return p;
}

function answer(p: Platform, host: string, method: string, params: Record<string, unknown>): unknown {
  const types = (params.types as string[] | undefined) ?? [];
  const streams = (params.streams as string[] | undefined) ?? [];
  if (host === "bob.example.test") {
    if (method === "events.get" && streams[0] === ":_cmc:apps:demo") return { events: p.requests };
    if (method === "events.get" && types[0] === "consent/accept-cmc") return { events: p.accepts };
    if (method === "events.get") return { events: [] };
    if (method === "events.getOne") return { event: p.requests.find((r) => r.id === params.id) };
    if (method === "events.create" && params.type === "consent/request-cmc") {
      const ev: Ev = {
        id: "r-new",
        time: NOW,
        streamIds: params.streamIds as string[],
        type: "consent/request-cmc",
        content: { ...(params.content as object), status: "pending", capabilityUrl: "https://cap-token@bob.example.test/", capabilityExpiresAt: NOW + 7 * 86400 },
      };
      p.requests = [ev, ...p.requests];
      return { event: ev };
    }
    if (method === "events.create") return { event: { id: "rev-1", streamIds: params.streamIds, type: params.type, content: params.content } };
  }
  if (host === "practice.example.test") {
    if (method === "streams.get") return { streams: [{ id: ":_cmc:apps:demo", name: "Demo", children: [{ id: TEAM_A, name: "Team A" }] }] };
    if (method === "events.get") return { events: p.groupInvites.filter((e) => under(e, streams[0])) };
    if (method === "events.getOne") return { event: p.groupInvites.find((e) => e.id === params.id) };
    if (method === "events.create" && params.type === "consent/member-access-cmc") {
      const memberAccess = { accessId: "c1", name: "cmc-member--bob--abc123", expires: NOW + 900, attribution: "stamped" };
      return {
        event: { id: "trig1", type: params.type, streamIds: params.streamIds, content: { ...(params.content as object), status: "completed", memberAccess } },
        memberAccess: { ...memberAccess, apiEndpoint: CHILD_ENDPOINT },
      };
    }
    if (method === "events.create") {
      const ev: Ev = {
        id: "inv-new",
        time: NOW,
        streamIds: params.streamIds as string[],
        type: params.type as string,
        content: { ...(params.content as object), status: "pending", capabilityUrl: "https://invite-token@practice.example.test/", capabilityExpiresAt: NOW + 7 * 86400 },
      };
      p.groupInvites = [...p.groupInvites, ev];
      return { event: ev };
    }
  }
  if (host === "pat.example.test") {
    if (method === "events.get") {
      return { events: [{ id: "e1", time: NOW - 10, streamIds: ["diary"], type: "note/txt", content: "Slept well" }] };
    }
    if (method === "streams.get") return { streams: [{ id: "diary", name: "Diary" }] };
  }
  return { error: { id: "unknown-resource", message: `unmocked ${method}` } };
}

/** Start the page signed in as bob (the browser session the sign-in leaves). */
export async function signedIn(context: BrowserContext) {
  await context.addInitScript(
    ([endpoint, serviceInfoUrl]) => {
      window.sessionStorage.setItem(
        "app-web-group-member.session",
        JSON.stringify({ apiEndpoint: endpoint, serviceInfoUrl, authUrl: "https://account.example.test/auth" }),
      );
    },
    [MEMBER_ENDPOINT, SERVICE_INFO_URL],
  );
}

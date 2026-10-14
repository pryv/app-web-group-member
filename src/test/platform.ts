/**
 * A small scripted platform for the page tests: the member's core (`bob`),
 * the group's core (`practice`, reached through the membership) and a
 * patient's core (`pat`), played through `cores` from ./fakePryv.
 */
import { cores, endpoint } from "./fakePryv";

export const MEMBER_ENDPOINT = endpoint("member-token", "bob");
export const MEMBERSHIP_ENDPOINT = endpoint("membership-token", "practice");
export const CHILD_ENDPOINT = endpoint("child-token", "pat");
export const PRACTICE = { username: "practice", host: "example.test" };
export const TEAM_A = ":_cmc:apps:demo:team-a";
export const NOW = Math.floor(Date.now() / 1000);

type Ev = { id: string; time: number; streamIds: string[]; type?: string; content: Record<string, unknown> };

export interface PlatformState {
  requests: Ev[];
  accepts: Ev[];
  groupInvites: Ev[];
  patientEvents: Array<{ id: string; time: number; streamIds: string[]; type: string; content: unknown }>;
  /** What the next member-access request answers. */
  memberAccess: () => unknown;
  /** The next reads of the inbox fail (a server error), this many times. */
  inboxFailures: number;
  created: Array<{ endpoint: string; params: Record<string, unknown> }>;
}

export function acceptedRequest(id = "r1"): Ev {
  return {
    id,
    time: NOW - 100,
    streamIds: [":_cmc:apps:demo"],
    type: "consent/request-cmc",
    content: {
      status: "accepted",
      acceptedBy: PRACTICE,
      backChannelAccessId: "bc1",
      request: { membership: true, permissions: [{ streamId: TEAM_A, level: "contribute" }] },
    },
  };
}

export function membershipAccept(inviteEventId = "r1"): Ev {
  return {
    id: "acc-" + inviteEventId,
    time: NOW - 50,
    streamIds: [":_cmc:inbox"],
    content: { from: PRACTICE, requesterAppCode: "demo", inviteEventId, membership: true, grantedAccess: { apiEndpoint: MEMBERSHIP_ENDPOINT } },
  };
}

export function grantedMemberAccess(attribution = "stamped") {
  return {
    event: { id: "trig1", content: { status: "completed", memberAccess: { accessId: "c1", name: "cmc-member--bob--abc123", expires: NOW + 3600, attribution } } },
    memberAccess: { apiEndpoint: CHILD_ENDPOINT, accessId: "c1", name: "cmc-member--bob--abc123", expires: NOW + 3600, attribution },
  };
}

function under(e: Ev, stream: string): boolean {
  return e.streamIds.some((s) => s === stream || s.startsWith(stream + ":"));
}

export function installPlatform(initial: Partial<PlatformState> = {}): PlatformState {
  const state: PlatformState = {
    requests: [],
    accepts: [],
    groupInvites: [
      {
        id: "i1",
        time: NOW - 80,
        streamIds: [TEAM_A],
        content: { status: "accepted", acceptedBy: { username: "pat", host: "far.test" }, acceptedAt: NOW - 70, capabilityUrl: "https://cap-i1@practice.example.test/" },
      },
      { id: "i2", time: NOW - 60, streamIds: [TEAM_A], content: { status: "pending", capabilityUrl: "https://cap-i2@practice.example.test/", capabilityExpiresAt: NOW + 3600 } },
    ],
    patientEvents: [{ id: "e1", time: NOW - 10, streamIds: ["diary"], type: "note/txt", content: "Slept well" }],
    memberAccess: () => grantedMemberAccess(),
    inboxFailures: 0,
    created: [],
    ...initial,
  };
  cores.accessInfo = (ep) => {
    if (ep === MEMBER_ENDPOINT) return { type: "app", user: { username: "bob" }, permissions: [] };
    if (ep === MEMBERSHIP_ENDPOINT) {
      return { type: "shared", user: { username: "practice" }, permissions: [{ streamId: TEAM_A, level: "contribute" }, { streamId: ":_cmc:inbox", level: "create-only" }] };
    }
    return { error: { id: "invalid-access-token" } };
  };
  cores.handle = (ep, method, params) => {
    const types = (params.types as string[] | undefined) ?? [];
    const streams = (params.streams as string[] | undefined) ?? [];
    if (ep === MEMBER_ENDPOINT) {
      if (method === "events.get" && streams[0] === ":_cmc:apps:demo") return { events: state.requests };
      if (method === "events.get" && types[0] === "consent/accept-cmc") {
        if (state.inboxFailures > 0) {
          state.inboxFailures--;
          return { error: { id: "api-unavailable", message: "temporarily unavailable" } };
        }
        return { events: state.accepts };
      }
      if (method === "events.get") return { events: [] };
      if (method === "events.getOne") return { event: state.requests.find((r) => r.id === params.id) };
      if (method === "events.create") {
        state.created.push({ endpoint: ep, params });
        if (params.type === "consent/request-cmc") {
          const ev: Ev = {
            id: "r-new",
            time: NOW,
            streamIds: params.streamIds as string[],
            type: "consent/request-cmc",
            content: { ...(params.content as Record<string, unknown>), status: "pending", capabilityUrl: "https://cap-new@bob.example.test/", capabilityExpiresAt: NOW + 7 * 86400 },
          };
          state.requests = [ev, ...state.requests];
          return { event: ev };
        }
        return { event: { id: "ev-" + state.created.length, ...params } };
      }
    }
    if (ep === MEMBERSHIP_ENDPOINT) {
      if (method === "streams.get") return { streams: [{ id: ":_cmc:apps:demo", name: "Demo", children: [{ id: TEAM_A, name: "Team A" }] }] };
      if (method === "events.get") return { events: state.groupInvites.filter((e) => under(e, streams[0])) };
      if (method === "events.getOne") return { event: state.groupInvites.find((e) => e.id === params.id) };
      if (method === "events.create") {
        state.created.push({ endpoint: ep, params });
        if (params.type === "consent/member-access-cmc") return state.memberAccess();
        return { event: { id: "inv-new", streamIds: params.streamIds, content: { ...(params.content as object), capabilityUrl: "https://cap-new-invite@practice.example.test/" } } };
      }
    }
    if (ep === CHILD_ENDPOINT) {
      if (method === "events.get") return { events: state.patientEvents };
      if (method === "streams.get") return { streams: [{ id: "diary", name: "Diary" }] };
    }
    return { error: { id: "unknown-resource", message: `unscripted ${method}` } };
  };
  return state;
}

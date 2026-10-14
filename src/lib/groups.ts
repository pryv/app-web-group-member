/**
 * The member's groups, read from the member's own account.
 *
 * - Each membership request is a `consent/request-cmc` the member wrote on
 *   `:_cmc:apps:<appCode>` with `request.membership: true`. The core stamps
 *   it when the group answers (`acceptedBy`, `backChannelAccessId`).
 * - The group's acceptance arrives in the member's `:_cmc:inbox`, marked
 *   `membership: true` and naming the request (`inviteEventId`); it carries
 *   the membership's endpoint (`grantedAccess.apiEndpoint`), an access on the
 *   group's account. It is kept in memory only, and read again on each visit.
 * - A membership that ended (the group revoked it, or the member left)
 *   arrives as a `consent/revoke-cmc` in the inbox.
 */
import { cmc, type CmcActor, type Connection, type InviteStatus } from "./pryvClient";

export type GroupPhase = "member" | "arriving" | "waiting" | "ended";

export interface GroupRecord {
  /** The membership request on the member's account: this app's key for the group. */
  inviteEventId: string;
  group: CmcActor | null;
  status: InviteStatus;
  phase: GroupPhase;
  /** Team streams the member asked for (on the group's account). */
  requestedTeams: string[];
  /** The request's link, while it waits (a capability: hand it to an administrator only). */
  capabilityUrl: string | null;
  expiresAt: number | null;
  requestedAt: number | null;
  acceptedAt: number | null;
  /** Where the request was written on the member's account. */
  scopeStreamId: string;
  backChannelAccessId: string | null;
  /** The membership: an access on the group's account. Carries a token: memory only. */
  membershipApiEndpoint: string | null;
}

interface RawEvent {
  id: string;
  time?: number;
  streamIds?: string[];
  content?: Record<string, unknown>;
}

type BatchResult = { events?: RawEvent[]; error?: { id?: string } };

const MISSING_STREAM_IDS = ["unknown-referenced-resource", "unknown-resource"];

function eventsOf(result: BatchResult | undefined): RawEvent[] {
  if (result == null) return [];
  if (result.error != null) {
    // The app scope or the inbox not created yet: nothing to list.
    if (MISSING_STREAM_IDS.includes(String(result.error.id))) return [];
    throw Object.assign(new Error("events.get refused"), { innerObject: result.error });
  }
  return result.events ?? [];
}

function actorOf(raw: unknown): CmcActor | null {
  const o = raw as Record<string, unknown> | null | undefined;
  return o && typeof o.username === "string" && typeof o.host === "string" ? { username: o.username, host: o.host } : null;
}

function num(raw: unknown): number | null {
  return typeof raw === "number" ? raw : null;
}

function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** The request's status as a member reads it (`expired` derived, like `@pryv/cmc`'s invite records). */
export function requestStatus(content: Record<string, unknown>, nowSeconds: number): InviteStatus {
  const expiresAt = num(content.capabilityExpiresAt) ?? num((content.request as Record<string, unknown> | undefined)?.expiresAt);
  const status = (str(content.status) ?? "pending") as InviteStatus;
  if ((status === "pending" || status === "delivered") && expiresAt != null && expiresAt <= nowSeconds) return "expired";
  return status;
}

function sameActor(a: CmcActor | null, b: CmcActor | null): boolean {
  return a != null && b != null && a.username === b.username && a.host === b.host;
}

/** The inbox acceptance of a request: by request id, else by group and app (older cores). */
export function findAcceptance(
  request: RawEvent,
  acceptedBy: CmcActor | null,
  appCode: string,
  accepts: RawEvent[],
): RawEvent | null {
  const candidates = accepts.filter((a) => {
    const c = a.content ?? {};
    // A mirror that carries the marker must say membership.
    return !("membership" in c) || c.membership === true;
  });
  const byId = candidates.find((a) => a.content?.inviteEventId === request.id);
  if (byId) return byId;
  return (
    candidates.find((a) => {
      const c = a.content ?? {};
      return c.inviteEventId == null && sameActor(actorOf(c.from), acceptedBy) && c.requesterAppCode === appCode;
    }) ?? null
  );
}

export function buildGroupRecords(
  requests: RawEvent[],
  accepts: RawEvent[],
  revokes: RawEvent[],
  appCode: string,
  pending: Record<string, CmcActor>,
  nowSeconds: number = Date.now() / 1000,
): GroupRecord[] {
  const revocations = revokes.map((e) => cmc.revocationFromEvent(e));
  const out: GroupRecord[] = [];
  for (const ev of requests) {
    const c = ev.content ?? {};
    const request = (c.request ?? {}) as Record<string, unknown>;
    if (request.membership !== true) continue;
    const acceptedBy = actorOf(c.acceptedBy);
    let status = requestStatus(c, nowSeconds);
    const backChannelAccessId = str(c.backChannelAccessId);
    const accepted = status === "accepted" || status === "completed";
    const acceptance = accepted ? findAcceptance(ev, acceptedBy, appCode, accepts) : null;
    const endpoint = str((acceptance?.content?.grantedAccess as Record<string, unknown> | undefined)?.apiEndpoint);
    const scopeStreamId = (ev.streamIds && ev.streamIds[0]) || `:_cmc:apps:${appCode}`;
    const ended = accepted && revocations.some((r) =>
      cmc.revocationMatches(r, backChannelAccessId != null
        ? { accessId: backChannelAccessId, inviteEventId: ev.id }
        : { inviteEventId: ev.id }),
    );
    if (ended) status = "revoked";
    let phase: GroupPhase;
    if (ended || !(accepted || status === "pending" || status === "delivered")) phase = "ended";
    else if (accepted) phase = endpoint != null ? "member" : "arriving";
    else phase = "waiting";
    const permissions = Array.isArray(request.permissions) ? (request.permissions as Array<{ streamId?: unknown }>) : [];
    out.push({
      inviteEventId: ev.id,
      group: acceptedBy ?? pending[ev.id] ?? null,
      status,
      phase,
      requestedTeams: permissions.map((p) => p.streamId).filter((s): s is string => typeof s === "string"),
      capabilityUrl: phase === "waiting" ? str(c.capabilityUrl) : null,
      expiresAt: num(c.capabilityExpiresAt) ?? num(request.expiresAt),
      requestedAt: num(ev.time),
      acceptedAt: num(c.acceptedAt),
      scopeStreamId,
      backChannelAccessId,
      membershipApiEndpoint: phase === "member" ? endpoint : null,
    });
  }
  const order: Record<GroupPhase, number> = { member: 0, arriving: 1, waiting: 2, ended: 3 };
  return out.sort((a, b) => order[a.phase] - order[b.phase] || (b.requestedAt ?? 0) - (a.requestedAt ?? 0));
}

/** Read the member's groups: one batch call on the member's own account. */
export async function listGroups(
  member: Connection,
  appCode: string,
  pending: Record<string, CmcActor>,
): Promise<GroupRecord[]> {
  const results = (await member.api([
    { method: "events.get", params: { streams: [cmc.appScope(appCode)], types: [cmc.ET_REQUEST], limit: 200 } },
    { method: "events.get", params: { streams: [cmc.NS_INBOX], types: [cmc.ET_ACCEPT], limit: 500 } },
    { method: "events.get", params: { streams: [cmc.NS_INBOX], types: [cmc.ET_REVOKE], limit: 500 } },
  ])) as BatchResult[];
  return buildGroupRecords(eventsOf(results[0]), eventsOf(results[1]), eventsOf(results[2]), appCode, pending);
}

/** A stable key for a group in an address: its request id (no credential). */
export function groupLabel(g: Pick<GroupRecord, "group">): string {
  return g.group ? `${g.group.username}@${g.group.host}` : "";
}

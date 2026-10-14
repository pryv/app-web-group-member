/**
 * The group's side, through the membership: teams, patients and invites.
 *
 * The membership is an access on the group's account with `contribute` on
 * the team streams an administrator granted. Patients are the CMC
 * relationships under those teams: each patient answered an invite a member
 * published from the group's account (`@pryv/cmc` `listInvites` on the team
 * stream).
 */
import { cmc, type Connection, type InviteRecord } from "./pryvClient";
import { isTeamStreamId, type InviteSettings } from "./config";

export interface Team {
  streamId: string;
  name: string;
  level: string;
}

interface StreamNode {
  id: string;
  name?: string;
  children?: StreamNode[];
}

function flatten(streams: StreamNode[], out: Map<string, string> = new Map()): Map<string, string> {
  for (const s of streams) {
    if (typeof s.name === "string") out.set(s.id, s.name);
    if (Array.isArray(s.children)) flatten(s.children, out);
  }
  return out;
}

/** The last segment of a stream id, as a fallback name. */
export function shortName(streamId: string): string {
  const i = streamId.lastIndexOf(":");
  return i === -1 ? streamId : streamId.slice(i + 1);
}

/** The teams a membership holds: its permissions on team streams, named from `streams.get`. */
export async function membershipTeams(membership: Connection): Promise<Team[]> {
  const info = (await membership.accessInfo()) as { permissions?: Array<{ streamId?: string; level?: string }> };
  const perms = (info.permissions ?? []).filter(
    (p): p is { streamId: string; level: string } => isTeamStreamId(p.streamId) && typeof p.level === "string",
  );
  let names = new Map<string, string>();
  try {
    const streams = (await membership.apiOne("streams.get", {}, "streams")) as StreamNode[];
    names = flatten(streams ?? []);
  } catch {
    // Names are a nicety: fall back to the ids.
  }
  return perms.map((p) => ({ streamId: p.streamId, name: names.get(p.streamId) ?? shortName(p.streamId), level: p.level }));
}

export interface TeamInvite extends InviteRecord {
  team: Team;
}

export interface TeamRoster {
  /** Patients who accepted: open their data with a member access. */
  patients: TeamInvite[];
  /** Invites still waiting for a patient. */
  waiting: TeamInvite[];
  /** Refused, revoked, expired. */
  ended: TeamInvite[];
}

/** Whether `streamId` is `team` or under it. */
export function isUnder(streamId: string, team: string): boolean {
  return streamId === team || streamId.startsWith(team + ":");
}

export function sortRoster(records: TeamInvite[]): TeamRoster {
  const roster: TeamRoster = { patients: [], waiting: [], ended: [] };
  for (const r of records) {
    if ((r.status === "accepted" || r.status === "completed") && r.counterparty) roster.patients.push(r);
    else if (r.status === "pending" || r.status === "delivered") roster.waiting.push(r);
    else roster.ended.push(r);
  }
  return roster;
}

/** Every invite under the membership's teams, each counted once (under its deepest team). */
export async function listRoster(membership: Connection, teams: Team[]): Promise<TeamRoster> {
  const byId = new Map<string, TeamInvite>();
  const deepestFirst = [...teams].sort((a, b) => b.streamId.length - a.streamId.length);
  for (const team of teams) {
    const { items } = await cmc.listInvites(membership, { scopeStreamId: team.streamId, limit: 500 });
    for (const item of items) {
      if (byId.has(item.inviteEventId)) continue;
      const owner = deepestFirst.find((t) => isUnder(item.scopeStreamId, t.streamId)) ?? team;
      byId.set(item.inviteEventId, { ...item, team: owner });
    }
  }
  return sortRoster([...byId.values()]);
}

/**
 * Publish a patient invite for the group, on a team stream. The grant must be
 * delegable (`accessType: 'app'`): the group's core creates each member's
 * access on the patient's account from it.
 */
export async function invitePatient(
  membership: Connection,
  params: { appCode: string; team: Team; invite: InviteSettings },
) {
  return cmc.createInvite(membership, {
    appCode: params.appCode,
    scopeStreamId: params.team.streamId,
    displayName: params.invite.displayName,
    requestedPermissions: params.invite.permissions,
    accessType: "app",
    ...(params.invite.consent ? { consent: params.invite.consent } : {}),
  });
}

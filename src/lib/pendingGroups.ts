/**
 * Which group each membership request was addressed to, while it waits.
 *
 * A membership request event does not name the group (the member hands the
 * link over by hand; the group is known once it accepts). This app remembers
 * the group it was written for, per member, in `localStorage`: a username and
 * a host, never the capability URL nor any token. Losing it costs only the
 * group's name on a pending request.
 */
import type { CmcActor } from "./pryvClient";

const KEY_PREFIX = "app-web-group-member.pending.";

type PendingMap = Record<string, CmcActor>;

function key(memberUsername: string): string {
  return KEY_PREFIX + memberUsername;
}

export function readPending(memberUsername: string): PendingMap {
  try {
    const raw = localStorage.getItem(key(memberUsername));
    const parsed = raw == null ? {} : (JSON.parse(raw) as unknown);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: PendingMap = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      const o = v as Record<string, unknown> | null;
      if (o && typeof o.username === "string" && typeof o.host === "string") {
        out[id] = { username: o.username, host: o.host };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function rememberPending(memberUsername: string, inviteEventId: string, group: CmcActor): void {
  const map = readPending(memberUsername);
  map[inviteEventId] = { username: group.username, host: group.host };
  try {
    localStorage.setItem(key(memberUsername), JSON.stringify(map));
  } catch {
    // Storage blocked: the group's name is shown once it accepts.
  }
}

/** Keep only the entries still listed (the others were answered or are gone). */
export function prunePending(memberUsername: string, keepIds: Iterable<string>): void {
  const keep = new Set(keepIds);
  const map = readPending(memberUsername);
  const next: PendingMap = {};
  for (const [id, g] of Object.entries(map)) if (keep.has(id)) next[id] = g;
  if (Object.keys(next).length === Object.keys(map).length) return;
  try {
    localStorage.setItem(key(memberUsername), JSON.stringify(next));
  } catch {
    // ignore
  }
}

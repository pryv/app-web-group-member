/**
 * Opening a patient's data: ask the group's core for a member access, then
 * talk to the patient's core directly with it.
 *
 * The access's endpoint carries a token. The group's core returns it once, in
 * the answer to the request, and never stores it. This app keeps it in memory
 * for the page that shows the patient, and never writes it to storage, to the
 * address, to a log line or to the screen.
 */
import { Pryv, cmc, type Connection, type MemberAccess } from "./pryvClient";
import type { TeamInvite } from "./patients";
import { RETRY_SHORTLY_IDS } from "./errors";

export interface OpenedPatient {
  /** The access, without its endpoint. */
  access: Omit<MemberAccess, "apiEndpoint">;
  /** A connection to the patient's core under the member access. */
  connection: Connection;
}

/** Waits before asking again after an "ask again shortly" answer. */
export const RETRY_DELAYS_MS = [1000, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function requestPatientAccess(
  membership: Connection,
  patient: TeamInvite,
  opts: { expireAfter: number; delaysMs?: number[]; isCancelled?: () => boolean },
): Promise<OpenedPatient> {
  const counterparty = patient.counterparty;
  if (!counterparty) throw new Error("the invite has no patient yet");
  const delays = opts.delaysMs ?? RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      const access = await cmc.requestMemberAccess(membership, {
        counterparty: { username: counterparty.username, host: counterparty.host },
        streamId: patient.team.streamId,
        scopeStreamId: patient.scopeStreamId,
        expireAfter: opts.expireAfter,
      });
      const { apiEndpoint, ...rest } = access;
      return { access: rest, connection: new Pryv.Connection(apiEndpoint) };
    } catch (err) {
      const id = (err as { id?: string } | null)?.id;
      const retry = id != null && RETRY_SHORTLY_IDS.includes(id) && attempt < delays.length;
      if (!retry || opts.isCancelled?.()) throw err;
      await sleep(delays[attempt]);
      if (opts.isCancelled?.()) throw err;
    }
  }
}

export interface PatientEvent {
  id: string;
  time: number;
  type: string;
  streamIds: string[];
  content: unknown;
}

/** The most recent events the member access can read, newest first. */
export async function readTimeline(
  patient: Connection,
  opts: { limit: number; toTime?: number },
): Promise<{ events: PatientEvent[]; streamNames: Map<string, string> }> {
  const params: Record<string, unknown> = { limit: opts.limit };
  if (opts.toTime != null) params.toTime = opts.toTime;
  const results = (await patient.api([
    { method: "events.get", params },
    { method: "streams.get", params: {} },
  ])) as Array<{ events?: PatientEvent[]; streams?: Array<{ id: string; name?: string; children?: unknown[] }>; error?: unknown }>;
  if (results[0]?.error) throw Object.assign(new Error("events.get refused"), { innerObject: results[0].error });
  const names = new Map<string, string>();
  const walk = (list: Array<{ id: string; name?: string; children?: unknown[] }> | undefined) => {
    for (const s of list ?? []) {
      if (typeof s.name === "string") names.set(s.id, s.name);
      walk(s.children as typeof list);
    }
  };
  walk(results[1]?.streams);
  return { events: results[0]?.events ?? [], streamNames: names };
}

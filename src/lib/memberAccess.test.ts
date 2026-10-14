import { beforeEach, describe, expect, it, vi } from "vitest";
import { cores, endpoint, FakeConnection, resetCores, withFakePryv } from "../test/fakePryv";

vi.mock("./pryvClient", async (orig) => withFakePryv(await orig()));

const { readTimeline, requestPatientAccess } = await import("./memberAccess");

const MEMBERSHIP = endpoint("membership-token", "practice");
const CHILD = endpoint("child-token", "pat");
const TEAM_A = ":_cmc:apps:demo:team-a";
const PATIENT = {
  inviteEventId: "i1",
  capabilityUrl: null,
  mode: "single-use" as const,
  status: "accepted" as const,
  expiresAt: null,
  counterparty: { username: "pat", host: "far.test" },
  scopeStreamId: TEAM_A + ":dr-who",
  team: { streamId: TEAM_A, name: "A", level: "contribute" },
};

const GRANTED = {
  event: { id: "trig1", content: { status: "completed", memberAccess: { accessId: "c1", name: "cmc-member--bob--abc", expires: 1_900_000_000, attribution: "stamped" } } },
  memberAccess: { apiEndpoint: CHILD, accessId: "c1", name: "cmc-member--bob--abc", expires: 1_900_000_000, attribution: "stamped" },
};

beforeEach(resetCores);

describe("[MAC] member access on a patient", () => {
  it("[MAC1] asks the group's core on the team stream, then connects to the patient's core; the endpoint is not in the returned record", async () => {
    cores.handle = (_e, method) => (method === "events.create" ? GRANTED : {});
    const opened = await requestPatientAccess(new FakeConnection(MEMBERSHIP) as never, PATIENT, { expireAfter: 900 });
    const create = cores.calls[0];
    expect(create).toMatchObject({
      endpoint: MEMBERSHIP,
      method: "events.create",
      params: {
        streamIds: [TEAM_A],
        type: "consent/member-access-cmc",
        content: { counterparty: { username: "pat", host: "far.test" }, scopeStreamId: TEAM_A + ":dr-who", expireAfter: 900 },
      },
    });
    expect(opened.access).toEqual({ triggerEventId: "trig1", accessId: "c1", name: "cmc-member--bob--abc", expires: 1_900_000_000, attribution: "stamped" });
    expect(JSON.stringify(opened.access)).not.toContain("child-token");
    expect((opened.connection as unknown as FakeConnection).apiEndpoint).toBe(CHILD);
  });

  it("[MAC2] asks again shortly after in-flight or an unreachable patient core, then succeeds", async () => {
    let n = 0;
    cores.handle = () => {
      n++;
      if (n === 1) return { error: { id: "invalid-operation", data: { id: "cmc-member-access-in-flight" } } };
      if (n === 2) return { event: { id: "t", content: { status: "failed", failure: { reason: "cmc-member-access-peer-unreachable" } } } };
      return GRANTED;
    };
    const opened = await requestPatientAccess(new FakeConnection(MEMBERSHIP) as never, PATIENT, { expireAfter: 900, delaysMs: [1, 1] });
    expect(n).toBe(3);
    expect(opened.access.accessId).toBe("c1");
  });

  it("[MAC3] other refusals are not retried, and carry their id", async () => {
    cores.handle = () => ({ event: { id: "t", content: { status: "failed", failure: { reason: "cmc-member-access-grant-not-delegable" } } } });
    await expect(requestPatientAccess(new FakeConnection(MEMBERSHIP) as never, PATIENT, { expireAfter: 900, delaysMs: [1, 1] })).rejects.toMatchObject({
      id: "cmc-member-access-grant-not-delegable",
    });
    expect(cores.calls).toHaveLength(1);
  });

  it("[MAC4] a retryable failure gives up after the planned retries", async () => {
    cores.handle = () => ({ error: { id: "x", data: { id: "cmc-member-access-in-flight" } } });
    await expect(requestPatientAccess(new FakeConnection(MEMBERSHIP) as never, PATIENT, { expireAfter: 900, delaysMs: [1, 1] })).rejects.toMatchObject({
      id: "cmc-member-access-in-flight",
    });
    expect(cores.calls).toHaveLength(3);
  });

  it("[MAC5] the timeline is read on the patient's core with the stream names", async () => {
    cores.handle = (_e, method) =>
      method === "events.get"
        ? { events: [{ id: "e1", time: 5, type: "note/txt", streamIds: ["diary"], content: "hello" }] }
        : { streams: [{ id: "parent", name: "Health", children: [{ id: "diary", name: "Diary" }] }] };
    const page = await readTimeline(new FakeConnection(CHILD) as never, { limit: 30, toTime: 10 });
    expect(page.events).toHaveLength(1);
    expect(page.streamNames.get("diary")).toBe("Diary");
    expect(cores.calls[0]).toMatchObject({ endpoint: CHILD, method: "events.get", params: { limit: 30, toTime: 10 } });
  });
});

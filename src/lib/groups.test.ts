import { beforeEach, describe, expect, it, vi } from "vitest";
import { cores, endpoint, FakeConnection, resetCores, withFakePryv } from "../test/fakePryv";

vi.mock("./pryvClient", async (orig) => withFakePryv(await orig()));

const { buildGroupRecords, listGroups } = await import("./groups");

const NOW = 1_800_000_000;
const PRACTICE = { username: "practice", host: "example.test" };
const MEMBERSHIP_ENDPOINT = endpoint("membership-token", "practice");

function request(id: string, content: Record<string, unknown>, time = NOW - 100) {
  return {
    id,
    time,
    streamIds: [":_cmc:apps:demo"],
    content: {
      capabilityUrl: `https://cap-${id}@bob.example.test/`,
      capabilityExpiresAt: NOW + 3600,
      request: { membership: true, permissions: [{ streamId: ":_cmc:apps:demo:team-a", level: "contribute" }] },
      ...content,
    },
  };
}

function accept(content: Record<string, unknown>) {
  return {
    id: "acc-" + Math.random(),
    time: NOW - 50,
    streamIds: [":_cmc:inbox"],
    content: { from: PRACTICE, requesterAppCode: "demo", grantedAccess: { apiEndpoint: MEMBERSHIP_ENDPOINT }, ...content },
  };
}

beforeEach(resetCores);

describe("[GRP] the member's groups", () => {
  it("[GRP1] a waiting request: its link to hand over, the group remembered by this browser", () => {
    const [g] = buildGroupRecords([request("r1", {})], [], [], "demo", { r1: PRACTICE }, NOW);
    expect(g).toMatchObject({
      inviteEventId: "r1",
      phase: "waiting",
      status: "pending",
      group: PRACTICE,
      requestedTeams: [":_cmc:apps:demo:team-a"],
      capabilityUrl: "https://cap-r1@bob.example.test/",
      membershipApiEndpoint: null,
    });
  });

  it("[GRP9] a waiting request's link is shown only when it is an http(s) URL", () => {
    for (const capabilityUrl of ["javascript:alert(1)", "data:text/html,x", "/relative", "  "]) {
      const [g] = buildGroupRecords([request("r9", { capabilityUrl })], [], [], "demo", { r9: PRACTICE }, NOW);
      expect(g.phase).toBe("waiting");
      expect(g.capabilityUrl).toBeNull();
    }
  });

  it("[GRP2] an accepted request becomes a membership, its endpoint read from the inbox by request id", () => {
    const records = buildGroupRecords(
      [request("r1", { status: "accepted", acceptedBy: PRACTICE, backChannelAccessId: "bc1" })],
      [accept({ inviteEventId: "other", grantedAccess: { apiEndpoint: "https://wrong@practice.example.test/" } }), accept({ inviteEventId: "r1", membership: true })],
      [],
      "demo",
      {},
      NOW,
    );
    expect(records[0]).toMatchObject({ phase: "member", group: PRACTICE, membershipApiEndpoint: MEMBERSHIP_ENDPOINT });
    // No link to hand over once accepted.
    expect(records[0].capabilityUrl).toBeNull();
  });

  it("[GRP3] an acceptance marked as not a membership is never used", () => {
    const [g] = buildGroupRecords(
      [request("r1", { status: "accepted", acceptedBy: PRACTICE })],
      [accept({ inviteEventId: "r1", membership: false })],
      [],
      "demo",
      {},
      NOW,
    );
    expect(g.phase).toBe("arriving");
    expect(g.membershipApiEndpoint).toBeNull();
  });

  it("[GRP4] an older core's mirror without the request id: matched on group and app", () => {
    const [g] = buildGroupRecords(
      [request("r1", { status: "accepted", acceptedBy: PRACTICE })],
      [accept({ requesterAppCode: "other-app" }), accept({ from: { username: "else", host: "example.test" } }), accept({})],
      [],
      "demo",
      {},
      NOW,
    );
    expect(g.membershipApiEndpoint).toBe(MEMBERSHIP_ENDPOINT);
  });

  it("[GRP5] a revocation in the inbox ends the membership", () => {
    const [g] = buildGroupRecords(
      [request("r1", { status: "accepted", acceptedBy: PRACTICE, backChannelAccessId: "bc1" })],
      [accept({ inviteEventId: "r1", membership: true })],
      [{ id: "rev1", content: { backChannelAccessId: "bc1", inviteEventId: "r1", from: PRACTICE } }],
      "demo",
      {},
      NOW,
    );
    expect(g).toMatchObject({ phase: "ended", status: "revoked", membershipApiEndpoint: null });
  });

  it("[GRP6] expired, refused and non-membership requests", () => {
    const records = buildGroupRecords(
      [
        request("old", { capabilityExpiresAt: NOW - 1 }),
        request("no", { status: "refused" }),
        { id: "invite", time: NOW, streamIds: [":_cmc:apps:demo"], content: { request: { permissions: [] } } },
      ],
      [],
      [],
      "demo",
      {},
      NOW,
    );
    expect(records.map((r) => [r.inviteEventId, r.phase, r.status])).toEqual([
      ["old", "ended", "expired"],
      ["no", "ended", "refused"],
    ]);
    expect(records.every((r) => r.capabilityUrl === null)).toBe(true);
  });

  it("[GRP7] listGroups reads the app scope and the inbox in one batch on the member's account", async () => {
    cores.handle = (_e, method, params) => {
      if (method !== "events.get") return { error: { id: "unknown-resource" } };
      const streams = params.streams as string[];
      if (streams[0] === ":_cmc:apps:demo") return { events: [request("r1", { status: "accepted", acceptedBy: PRACTICE })] };
      if ((params.types as string[])[0] === "consent/accept-cmc") return { events: [accept({ inviteEventId: "r1", membership: true })] };
      // The inbox may not exist yet on a new account.
      return { error: { id: "unknown-referenced-resource" } };
    };
    const member = new FakeConnection(endpoint("member-token", "bob"));
    const list = await listGroups(member as never, "demo", {});
    expect(list[0].phase).toBe("member");
    expect(cores.calls.map((c) => [c.endpoint, c.method, (c.params.streams as string[])[0], (c.params.types as string[])[0]])).toEqual([
      [endpoint("member-token", "bob"), "events.get", ":_cmc:apps:demo", "consent/request-cmc"],
      [endpoint("member-token", "bob"), "events.get", ":_cmc:inbox", "consent/accept-cmc"],
      [endpoint("member-token", "bob"), "events.get", ":_cmc:inbox", "consent/revoke-cmc"],
    ]);
  });

  it("[GRP8] any other refusal is surfaced", async () => {
    cores.handle = () => ({ error: { id: "forbidden" } });
    const member = new FakeConnection(endpoint("member-token", "bob"));
    await expect(listGroups(member as never, "demo", {})).rejects.toMatchObject({ innerObject: { id: "forbidden" } });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cores, endpoint, FakeConnection, resetCores, withFakePryv } from "../test/fakePryv";

vi.mock("./pryvClient", async (orig) => withFakePryv(await orig()));

const { invitePatient, listRoster, membershipTeams, sortRoster } = await import("./patients");

const MEMBERSHIP = endpoint("membership-token", "practice");
const TEAM_A = ":_cmc:apps:demo:team-a";
const TEAM_B = ":_cmc:apps:demo:team-b";

function invite(id: string, stream: string, content: Record<string, unknown>) {
  return { id, time: 1, streamIds: [stream], content: { capabilityUrl: `https://cap-${id}@practice.example.test/`, ...content } };
}

beforeEach(resetCores);

describe("[PAT] teams and patients through the membership", () => {
  it("[PAT1] the teams are the membership's team-stream permissions, named from streams.get", async () => {
    cores.accessInfo = () => ({
      type: "shared",
      user: { username: "practice" },
      permissions: [
        { streamId: TEAM_A, level: "contribute" },
        { streamId: ":_cmc:apps:demo:team-a:chats", level: "contribute" },
        { streamId: ":_cmc:inbox", level: "create-only" },
        { streamId: TEAM_B, level: "contribute" },
      ],
    });
    cores.handle = (_e, method) =>
      method === "streams.get" ? { streams: [{ id: ":_cmc:apps:demo", name: "Demo", children: [{ id: TEAM_A, name: "Team A" }] }] } : {};
    const teams = await membershipTeams(new FakeConnection(MEMBERSHIP) as never);
    expect(teams).toEqual([
      { streamId: TEAM_A, name: "Team A", level: "contribute" },
      { streamId: TEAM_B, name: "team-b", level: "contribute" },
    ]);
  });

  it("[PAT2] patients are accepted invites under the teams, each counted once under its deepest team", async () => {
    const sub = TEAM_A + ":dr-who";
    cores.handle = (_e, method, params) => {
      if (method !== "events.get") return { error: { id: "unknown-resource" } };
      const s = (params.streams as string[])[0];
      const all = [
        invite("i1", TEAM_A, { status: "accepted", acceptedBy: { username: "pat", host: "far.test" } }),
        invite("i2", sub, { status: "accepted", acceptedBy: { username: "pat2", host: "far.test" } }),
        invite("i3", TEAM_A, { status: "pending", capabilityExpiresAt: 9_999_999_999 }),
        invite("i4", TEAM_B, { status: "refused", refusedBy: { username: "no", host: "far.test" } }),
      ];
      return { events: all.filter((e) => e.streamIds[0] === s || e.streamIds[0].startsWith(s + ":")) };
    };
    const teams = [
      { streamId: TEAM_A, name: "A", level: "contribute" },
      { streamId: sub, name: "Dr Who", level: "contribute" },
      { streamId: TEAM_B, name: "B", level: "contribute" },
    ];
    const roster = await listRoster(new FakeConnection(MEMBERSHIP) as never, teams);
    expect(roster.patients.map((p) => [p.inviteEventId, p.team.streamId, p.counterparty?.username])).toEqual([
      ["i1", TEAM_A, "pat"],
      ["i2", sub, "pat2"],
    ]);
    expect(roster.waiting.map((p) => p.inviteEventId)).toEqual(["i3"]);
    expect(roster.ended.map((p) => p.inviteEventId)).toEqual(["i4"]);
  });

  it("[PAT3] an accepted invite without a counterparty is not a patient", () => {
    const team = { streamId: TEAM_A, name: "A", level: "contribute" };
    const base = { capabilityUrl: null, mode: "single-use" as const, expiresAt: null, scopeStreamId: TEAM_A, team };
    const r = sortRoster([{ ...base, inviteEventId: "x", status: "accepted", counterparty: null }]);
    expect(r.patients).toEqual([]);
  });

  it("[PAT4] a patient invite is a delegable grant written on the team stream", async () => {
    cores.handle = (_e, method, params) =>
      method === "events.create" ? { event: { id: "inv1", streamIds: params.streamIds, content: { capabilityUrl: "https://cap@practice.example.test/" } } } : {};
    const res = await invitePatient(new FakeConnection(MEMBERSHIP) as never, {
      appCode: "demo",
      team: { streamId: TEAM_A, name: "A", level: "contribute" },
      invite: { displayName: "The practice", permissions: [{ streamId: "diary", level: "read" }], consent: { en: "Consent text" } },
    });
    expect(res.capabilityUrl).toBe("https://cap@practice.example.test/");
    const create = cores.calls.find((c) => c.method === "events.create")!;
    expect(create.endpoint).toBe(MEMBERSHIP);
    expect(create.params).toMatchObject({
      streamIds: [TEAM_A],
      type: "consent/request-cmc",
      content: {
        request: { accessType: "app", permissions: [{ streamId: "diary", level: "read" }], consent: { en: "Consent text" } },
        requesterMeta: { displayName: "The practice", appId: "demo" },
      },
    });
  });
});

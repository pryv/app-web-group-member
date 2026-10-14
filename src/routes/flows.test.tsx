import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { resetCores, withFakePryv } from "../test/fakePryv";

vi.mock("../lib/pryvClient", async (orig) => withFakePryv(await orig()));

const { default: App } = await import("../App");
const { SessionProvider } = await import("../lib/session");
const { _setConfigForTest } = await import("../lib/config");
const { SESSION_KEY } = await import("../lib/sessionStore");
const { acceptanceTiming } = await import("../lib/groups");
const platform = await import("../test/platform");
const { installPlatform, acceptedRequest, membershipAccept, grantedMemberAccess, MEMBER_ENDPOINT, TEAM_A } = platform;

function signIn() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ apiEndpoint: MEMBER_ENDPOINT, serviceInfoUrl: "https://reg.example.test/service/info", authUrl: "https://sw.example.test/auth" }),
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}

const CONSOLE_METHODS = ["log", "info", "debug", "warn", "error"] as const;
let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

/** Everything written to the console during the test, as one string. */
function consoleOutput(): string {
  return JSON.stringify(consoleSpies.map((s) => s.mock.calls), (_k, v) => (v instanceof Error ? `${v.name}: ${v.message}` : v));
}

/** Nothing that carries a token may reach the page, the storage or the console. */
function expectNoToken(token: string) {
  expect(document.body.innerHTML).not.toContain(token);
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) expect(store.getItem(store.key(i)!) ?? "").not.toContain(token);
  }
  expect(consoleOutput()).not.toContain(token);
}

beforeEach(() => {
  resetCores();
  _setConfigForTest({ serviceInfoUrl: "https://reg.example.test/service/info", appCode: "demo", appName: "Demo", accountAppUrl: "https://account.example.test/" });
  Object.assign(acceptanceTiming, { roundMs: 300, intervalMs: 50, retryMs: 50, refreshMs: 50 });
  // Every console method is watched (calls still go through).
  consoleSpies = CONSOLE_METHODS.map((m) => vi.spyOn(console, m));
});

afterEach(() => {
  // In every test: no token in any console output, the member's own included.
  const out = consoleOutput();
  for (const token of ["member-token", "membership-token", "child-token", "cap-"]) expect(out, token).not.toContain(token);
  for (const s of consoleSpies) s.mockRestore();
});

describe("[UI] member app pages", () => {
  it("[UI1] signed out: the sign-in page, or a configuration message without a platform", async () => {
    renderAt("/");
    expect(await screen.findByRole("button", { name: "Sign in with Pryv" })).toBeTruthy();
    _setConfigForTest({ serviceInfoUrl: null });
    renderAt("/");
    expect(await screen.findByText(/This app is not configured/)).toBeTruthy();
  });

  it("[UI2] join: the request is written on the member's account, then handed over by QR and links", async () => {
    signIn();
    const state = installPlatform();
    renderAt("/join");
    fireEvent.change(await screen.findByLabelText("Group account (username)"), { target: { value: "Practice" } });
    fireEvent.change(screen.getByLabelText("Group platform (host)"), { target: { value: "example.test" } });
    fireEvent.change(screen.getByLabelText("Team streams on the group's account"), { target: { value: TEAM_A } });
    fireEvent.click(screen.getByRole("button", { name: "Create the request" }));

    const handoff = await screen.findByTestId("membership-handoff");
    const create = state.created.find((c) => c.params.type === "consent/request-cmc")!;
    expect(create.endpoint).toBe(MEMBER_ENDPOINT);
    expect(create.params).toMatchObject({
      streamIds: [":_cmc:apps:demo"],
      content: { request: { membership: true, allowUserChoice: true, features: { chat: false, systemMessaging: true }, permissions: [{ streamId: TEAM_A, level: "contribute" }] } },
    });
    // QR code, administrator link (capabilityUrl only), bare capability for the paste path.
    expect(within(handoff).getByRole("img", { name: "QR code of the membership request" })).toBeTruthy();
    const link = new URL((screen.getByTestId("membership-link") as HTMLInputElement).value);
    expect(link.origin + link.pathname).toBe("https://account.example.test/account/memberships");
    expect([...link.searchParams.keys()]).toEqual(["capabilityUrl"]);
    expect((screen.getByTestId("membership-capability") as HTMLInputElement).value).toBe("https://cap-new@bob.example.test/");
    expect(screen.getByTestId("group-name").textContent).toBe("practice@example.test");
    // The group is remembered (name only) while the request waits.
    expect(localStorage.getItem("app-web-group-member.pending.bob")).toBe(JSON.stringify({ "r-new": { username: "practice", host: "example.test" } }));
  });

  it("[UI3] waiting: the group's acceptance arriving in the inbox turns the request into a membership", async () => {
    signIn();
    const state = installPlatform();
    state.requests = [{ ...acceptedRequest("r1"), content: { ...acceptedRequest("r1").content, status: "pending", capabilityUrl: "https://cap-r1@bob.example.test/", acceptedBy: undefined } }];
    localStorage.setItem("app-web-group-member.pending.bob", JSON.stringify({ r1: platform.PRACTICE }));
    renderAt("/groups/r1");
    expect(await screen.findByTestId("membership-handoff")).toBeTruthy();
    // The administrator approves.
    state.requests = [acceptedRequest("r1")];
    state.accepts = [membershipAccept("r1")];
    expect(await screen.findByRole("heading", { name: "Team A" })).toBeTruthy();
  });

  it("[UI4] member: teams, patients and waiting invites; a new invite is a delegable grant on the team stream", async () => {
    signIn();
    const state = installPlatform({ requests: [acceptedRequest("r1")], accepts: [membershipAccept("r1")] });
    renderAt("/groups/r1");
    const team = await screen.findByTestId("team-section");
    expect(within(team).getByTestId("patient-row").textContent).toContain("pat@far.test");
    expect(within(team).getAllByTestId("waiting-invite")).toHaveLength(1);
    fireEvent.click(within(team).getByRole("button", { name: "Invite a patient" }));
    const handoff = await within(team).findByTestId("invite-handoff");
    const create = state.created.find((c) => c.params.type === "consent/request-cmc")!;
    expect(create.endpoint).toBe(platform.MEMBERSHIP_ENDPOINT);
    expect(create.params).toMatchObject({ streamIds: [TEAM_A], content: { request: { accessType: "app" } } });
    const patientLink = new URL((within(handoff).getByTestId("invite-link") as HTMLInputElement).value);
    expect(patientLink.pathname).toBe("/cmc-accept");
    expect(patientLink.searchParams.get("scopeStreamId")).toBe(":_cmc:apps:demo");
  });

  it("[UI5] patient: a member access on the team stream, the timeline, and the token nowhere", async () => {
    signIn();
    const state = installPlatform({ requests: [acceptedRequest("r1")], accepts: [membershipAccept("r1")] });
    renderAt("/groups/r1/patients/i1");
    expect(await screen.findByText("Slept well")).toBeTruthy();
    expect(screen.getByTestId("patient-name").textContent).toBe("pat@far.test");
    expect(screen.getByTestId("member-access").textContent).toContain("cmc-member--bob--abc123");
    const ask = state.created.find((c) => c.params.type === "consent/member-access-cmc")!;
    expect(ask.params).toMatchObject({ streamIds: [TEAM_A], content: { counterparty: { username: "pat", host: "far.test" }, scopeStreamId: TEAM_A, expireAfter: 3600 } });
    expectNoToken("child-token");
    expectNoToken("membership-token");
  });

  it("[UI6] patient: an older patient core is said so; a refusal reads as a message and can be asked again", async () => {
    signIn();
    const state = installPlatform({ requests: [acceptedRequest("r1")], accepts: [membershipAccept("r1")] });
    state.memberAccess = () => ({ event: { id: "t", content: { status: "failed", failure: { reason: "cmc-member-access-grant-not-delegable" } } } });
    renderAt("/groups/r1/patients/i1");
    expect(await screen.findByText(/does not let the group share the data/)).toBeTruthy();
    state.memberAccess = () => grantedMemberAccess("name-only");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("attribution-name-only")).toBeTruthy();
  });

  it("[UI7] leaving asks in an in-app dialog, then revokes the member's half of the relationship", async () => {
    signIn();
    const nativeConfirm = vi.spyOn(window, "confirm");
    const state = installPlatform({ requests: [acceptedRequest("r1")], accepts: [membershipAccept("r1")] });
    renderAt("/groups/r1");
    fireEvent.click(await screen.findByRole("button", { name: "Leave the group" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Leave practice@example.test?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave the group" }));
    await waitFor(() => expect(state.created.some((c) => c.params.type === "consent/revoke-cmc")).toBe(true));
    const revoke = state.created.find((c) => c.params.type === "consent/revoke-cmc")!;
    expect(revoke).toMatchObject({ endpoint: MEMBER_ENDPOINT, params: { streamIds: [":_cmc:apps:demo"], content: { accessId: "bc1" } } });
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("[UI8] waiting: a server error is shown and the wait goes on; the approval still arrives", async () => {
    signIn();
    const state = installPlatform();
    state.requests = [{ ...acceptedRequest("r1"), content: { ...acceptedRequest("r1").content, status: "pending", capabilityUrl: "https://cap-r1@bob.example.test/", acceptedBy: undefined } }];
    localStorage.setItem("app-web-group-member.pending.bob", JSON.stringify({ r1: platform.PRACTICE }));
    renderAt("/groups/r1");
    expect(await screen.findByTestId("membership-handoff")).toBeTruthy();
    // The inbox read fails twice, then the administrator's approval is there.
    state.inboxFailures = 2;
    expect(await screen.findByTestId("error-message")).toBeTruthy();
    state.requests = [acceptedRequest("r1")];
    state.accepts = [membershipAccept("r1")];
    expect(await screen.findByRole("heading", { name: "Team A" })).toBeTruthy();
    expect(screen.queryByTestId("error-message")).toBeNull();
  });

  it("[UI9] waiting, account app not configured: a group on another platform gets the bare request link only", async () => {
    _setConfigForTest({ serviceInfoUrl: "https://reg.example.test/service/info", appCode: "demo", appName: "Demo", accountAppUrl: null });
    signIn();
    const state = installPlatform();
    const pending = { ...acceptedRequest("r1"), content: { ...acceptedRequest("r1").content, status: "pending", capabilityUrl: "https://cap-r1@bob.example.test/", acceptedBy: undefined } };
    state.requests = [pending];
    localStorage.setItem("app-web-group-member.pending.bob", JSON.stringify({ r1: { username: "lab", host: "other-platform.org" } }));
    const { unmount } = renderAt("/groups/r1");
    expect(await screen.findByTestId("membership-capability")).toBeTruthy();
    expect(screen.queryByTestId("membership-link")).toBeNull();
    unmount();
    // Same platform as the member: the account app next to the sign-in page.
    localStorage.setItem("app-web-group-member.pending.bob", JSON.stringify({ r1: platform.PRACTICE }));
    renderAt("/groups/r1");
    const link = new URL((await screen.findByTestId("membership-link") as HTMLInputElement).value);
    expect(link.origin + link.pathname).toBe("https://sw.example.test/account/memberships");
  });
});

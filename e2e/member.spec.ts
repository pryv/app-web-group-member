import { expect, test, type Page } from "@playwright/test";
import { acceptedRequest, membershipAccept, mockPlatform, signedIn, TEAM_A } from "./mockPlatform";

/** No token-bearing value in the address, the storage the page keeps across tabs, or the page text. */
async function expectTokenNowhere(page: Page, token: string) {
  expect(page.url()).not.toContain(token);
  const local = await page.evaluate(() => JSON.stringify({ ...window.localStorage }));
  expect(local).not.toContain(token);
  expect(await page.content()).not.toContain(token);
}

const TOKENS = ["member-token", "membership-token", "child-token", "cap-token", "invite-token"];

// Every console message of every page of the test (the sign-in pop-up included):
// none may carry a token or a request link.
let consoleMessages: string[] = [];
test.beforeEach(({ context }) => {
  consoleMessages = [];
  context.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
});
test.afterEach(() => {
  const all = consoleMessages.join("\n");
  for (const token of TOKENS) expect(all, token).not.toContain(token);
});

test.describe("[E2E] member app, against a mocked platform", () => {
  test("[E2E1] sign-in: the auth page opens in a pop-up, the poll's answer signs the member in", async ({ page, context }) => {
    await mockPlatform(context, { pollsBeforeAccept: 1 });
    await page.goto("/");
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Sign in with Pryv" }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/account\.example\.test\/auth\?key=k1/);
    await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as bob");
    await expect(page.getByText("You are not a member of any group yet.", { exact: false })).toBeVisible();
    // The session stays in this tab's sessionStorage; nothing in localStorage.
    expect(await page.evaluate(() => window.sessionStorage.getItem("app-web-group-member.session"))).toContain("member-token@bob.example.test");
    await expectTokenNowhere(page, "member-token");
  });

  test("[E2E2] join: the request, its QR code and links; the group's approval turns it into a membership", async ({ page, context }) => {
    const p = await mockPlatform(context);
    await signedIn(context);
    await page.goto("/#/join");
    // Group and team pre-filled from settings.json.
    await expect(page.getByLabel("Group account (username)")).toHaveValue("practice");
    await expect(page.getByLabel("Team A")).toBeChecked();
    await page.getByRole("button", { name: "Create the request" }).click();

    const handoff = page.getByTestId("membership-handoff");
    await expect(handoff.getByRole("img", { name: "QR code of the membership request" })).toBeVisible();
    const link = new URL(await page.getByTestId("membership-link").inputValue());
    expect(link.origin + link.pathname).toBe("https://account.example.test/account/memberships");
    expect([...link.searchParams.keys()]).toEqual(["capabilityUrl"]);
    expect(link.searchParams.get("capabilityUrl")).toBe("https://cap-token@bob.example.test/");
    await expect(page.getByTestId("membership-capability")).toHaveValue("https://cap-token@bob.example.test/");
    const create = p.calls.find((c) => c.method === "events.create")!;
    expect(create).toMatchObject({
      host: "bob.example.test",
      params: { streamIds: [":_cmc:apps:demo"], type: "consent/request-cmc", content: { request: { membership: true, permissions: [{ streamId: TEAM_A, level: "contribute" }] } } },
    });
    // The capability URL is never in the address.
    expect(page.url()).not.toContain("cap-token");

    // An administrator approves: the request is stamped and the acceptance lands in the inbox.
    p.requests = p.requests.map((r) => ({ ...r, content: { ...r.content, status: "accepted", acceptedBy: { username: "practice", host: "example.test" }, backChannelAccessId: "bc1" } }));
    p.accepts = [membershipAccept("r-new")];
    await expect(page.getByRole("heading", { name: "Team A" })).toBeVisible({ timeout: 15000 });
    await expectTokenNowhere(page, "membership-token");
  });

  test("[E2E3] member: invite a patient, open a patient's data, leave the group", async ({ page, context }) => {
    const p = await mockPlatform(context, { requests: [acceptedRequest("r1")], accepts: [membershipAccept("r1")] });
    await signedIn(context);
    await page.goto("/#/groups/r1");

    const team = page.getByTestId("team-section");
    await expect(team.getByTestId("patient-row")).toContainText("pat@example.test");

    // Invite: a delegable grant on the team stream, through the membership.
    await team.getByRole("button", { name: "Invite a patient" }).click();
    await expect(team.getByTestId("invite-handoff")).toBeVisible();
    const invite = p.calls.find((c) => c.method === "events.create" && c.host === "practice.example.test")!;
    expect(invite.params).toMatchObject({ streamIds: [TEAM_A], type: "consent/request-cmc", content: { request: { accessType: "app" } } });

    // Open a patient: a member access, then the patient's core directly.
    await team.getByTestId("patient-row").click();
    await expect(page.getByText("Slept well")).toBeVisible();
    await expect(page.getByTestId("member-access")).toContainText("cmc-member--bob--abc123");
    const ask = p.calls.find((c) => c.params.type === "consent/member-access-cmc")!;
    expect(ask).toMatchObject({ host: "practice.example.test", params: { streamIds: [TEAM_A], content: { counterparty: { username: "pat", host: "example.test" }, expireAfter: 900 } } });
    expect(p.calls.some((c) => c.host === "pat.example.test" && c.method === "events.get")).toBe(true);
    await expectTokenNowhere(page, "child-token");
    expect(await page.evaluate(() => window.sessionStorage.getItem("app-web-group-member.session") ?? "")).not.toContain("child-token");

    // Leave: an in-app dialog, then the member revokes their half of the relationship.
    await page.getByRole("link", { name: "practice@example.test" }).click();
    await page.getByRole("button", { name: "Leave the group" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Leave practice@example.test?");
    await dialog.getByRole("button", { name: "Leave the group" }).click();
    await expect(page.getByText("You left practice@example.test.", { exact: false })).toBeVisible();
    const revoke = p.calls.find((c) => c.params.type === "consent/revoke-cmc")!;
    expect(revoke).toMatchObject({ host: "bob.example.test", params: { streamIds: [":_cmc:apps:demo"], content: { accessId: "bc1" } } });
  });
});

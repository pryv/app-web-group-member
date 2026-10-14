import { describe, expect, it, vi } from "vitest";
import { authRequest, SignInError, waitForSignIn } from "./signIn";
import { parseConfig } from "./config";
import { readPending, rememberPending, prunePending } from "./pendingGroups";
import { clearSession, readSession, SESSION_KEY, stripQuery, writeSession } from "./sessionStore";

const config = parseConfig({ appCode: "practice", appName: "Practice" });

function fakeService(answers: Array<{ status: string }>) {
  let i = 0;
  return {
    pollAccessRequest: vi.fn(async () => answers[Math.min(i++, answers.length - 1)]),
    connectFromKey: vi.fn(async (key: string) => ({ apiEndpoint: "https://tok@bob.example.test/", key })),
  };
}

const STARTED = { key: "k1", authUrl: "https://sw.example.test/auth?key=k1", poll: "https://core.example.test/reg/access/k1", pollRateMs: 0 };

describe("[SIG] sign-in", () => {
  it("[SIG1] asks for read on the inbox and contribute on the app scope, with the one-time hand-off", () => {
    expect(authRequest(config, "en")).toEqual({
      requestingAppId: "app-web-group-member",
      languageCode: "en",
      requestedPermissions: [
        { streamId: ":_cmc:inbox", level: "read", defaultName: "Messaging inbox" },
        { streamId: ":_cmc:apps:practice", level: "contribute", defaultName: "Practice" },
      ],
      credentialHandoff: "shared-secret",
    });
  });

  it("[SIG2] polls the issued poll URL until accepted, then redeems the key", async () => {
    const service = fakeService([{ status: "NEED_SIGNIN" }, { status: "ACCEPTED" }]);
    const conn = await waitForSignIn(service as never, STARTED, { minIntervalMs: 1 });
    expect(service.pollAccessRequest).toHaveBeenCalledWith(STARTED.poll);
    expect(service.connectFromKey).toHaveBeenCalledWith("k1");
    expect(conn).toMatchObject({ key: "k1" });
  });

  it("[SIG3] a refusal, a timeout and a cancel end the wait", async () => {
    await expect(waitForSignIn(fakeService([{ status: "REFUSED" }]) as never, STARTED, { minIntervalMs: 1 })).rejects.toBeInstanceOf(SignInError);
    await expect(waitForSignIn(fakeService([{ status: "NEED_SIGNIN" }]) as never, STARTED, { minIntervalMs: 5, timeoutMs: 1 })).rejects.toMatchObject({ id: "sign-in-timeout" });
    const ctrl = new AbortController();
    const p = waitForSignIn(fakeService([{ status: "NEED_SIGNIN" }]) as never, STARTED, { minIntervalMs: 50, signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("[STO] what the browser keeps", () => {
  it("[STO1] the session lives in sessionStorage only; the auth page is kept without its query", () => {
    writeSession({ apiEndpoint: "https://tok@bob.example.test/", serviceInfoUrl: "https://reg.example.test/service/info", authUrl: stripQuery("https://sw.example.test/auth?key=k1") });
    expect(readSession()).toEqual({ apiEndpoint: "https://tok@bob.example.test/", serviceInfoUrl: "https://reg.example.test/service/info", authUrl: "https://sw.example.test/auth" });
    expect(localStorage.length).toBe(0);
    clearSession();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("[STO2] the pending-group memo holds a username and a host, nothing else", () => {
    rememberPending("bob", "r1", Object.assign({ username: "practice", host: "example.test" }, { capabilityUrl: "https://cap@x/" }));
    rememberPending("bob", "r2", { username: "lab", host: "example.test" });
    const raw = localStorage.getItem("app-web-group-member.pending.bob")!;
    expect(raw).not.toContain("cap@");
    expect(readPending("bob")).toEqual({ r1: { username: "practice", host: "example.test" }, r2: { username: "lab", host: "example.test" } });
    prunePending("bob", ["r2"]);
    expect(Object.keys(readPending("bob"))).toEqual(["r2"]);
    expect(readPending("alice")).toEqual({});
  });
});

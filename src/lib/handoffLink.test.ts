import { describe, expect, it } from "vitest";
import { accountAppFromAuthUrl, inviteLink, membershipLink, resolveAccountApp } from "./handoffLink";

const CAP = "https://cap-token@bob.example.test/";

describe("[HOL] hand-off links", () => {
  it("[HOL1] the membership QR target is <accountApp>account/memberships?capabilityUrl=<link>, nothing else", () => {
    const link = membershipLink("https://account.example.com/", CAP)!;
    const u = new URL(link);
    expect(u.origin + u.pathname).toBe("https://account.example.com/account/memberships");
    expect([...u.searchParams.keys()]).toEqual(["capabilityUrl"]);
    expect(u.searchParams.get("capabilityUrl")).toBe(CAP);
    // Never a scope parameter: where the group files the membership is the group's decision.
    expect(link).not.toContain("scopeStreamId");
  });

  it("[HOL2] a base with a path and its own query keeps both", () => {
    const link = membershipLink("https://host.example/app-web-user-account?pryvServiceInfoUrl=https%3A%2F%2Freg.example%2Fservice%2Finfo", CAP)!;
    const u = new URL(link);
    expect(u.pathname).toBe("/app-web-user-account/account/memberships");
    expect(u.searchParams.get("pryvServiceInfoUrl")).toBe("https://reg.example/service/info");
    expect(u.searchParams.get("capabilityUrl")).toBe(CAP);
  });

  it("[HOL3] no account app: no link (the bare capability URL is shown alone)", () => {
    expect(membershipLink(null, CAP)).toBeNull();
    expect(membershipLink("ftp://x/", CAP)).toBeNull();
    expect(inviteLink(null, CAP, ":_cmc:apps:p")).toBeNull();
  });

  it("[HOL4] the patient's link opens /cmc-accept with the patient-side scope", () => {
    const u = new URL(inviteLink("https://account.example.com/", CAP, ":_cmc:apps:practice")!);
    expect(u.pathname).toBe("/cmc-accept");
    expect(u.searchParams.get("capabilityUrl")).toBe(CAP);
    expect(u.searchParams.get("scopeStreamId")).toBe(":_cmc:apps:practice");
  });

  it("[HOL5] the account app is derived from the sign-in page when not configured", () => {
    expect(accountAppFromAuthUrl("https://sw.example.com/auth?key=abc")).toBe("https://sw.example.com/");
    expect(accountAppFromAuthUrl("https://host.example/app-web-user-account/auth")).toBe("https://host.example/app-web-user-account/");
    expect(accountAppFromAuthUrl("https://host.example/access")).toBeNull();
    expect(accountAppFromAuthUrl(null)).toBeNull();
    expect(resolveAccountApp("https://configured.example/", "https://sw.example.com/auth", "https://reg.example/service/info")).toBe("https://configured.example/");
    const derived = new URL(resolveAccountApp(null, "https://sw.example.com/auth", "https://reg.example/service/info")!);
    expect(derived.origin + derived.pathname).toBe("https://sw.example.com/");
    expect(derived.searchParams.get("pryvServiceInfoUrl")).toBe("https://reg.example/service/info");
    expect(resolveAccountApp(null, null, "https://reg.example/service/info")).toBeNull();
  });
});

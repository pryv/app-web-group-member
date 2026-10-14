import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, envSettings, isTeamStreamId, parseConfig, parseTeamIds } from "./config";

describe("[CFG] configuration", () => {
  it("[CFG1] an empty body gives the defaults, with no platform", () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
    expect(parseConfig(null).serviceInfoUrl).toBeNull();
    expect(parseConfig([1, 2]).appCode).toBe("group-member");
  });

  it("[CFG2] reads every key, settings.json over the environment", () => {
    const c = parseConfig(
      {
        serviceInfoUrl: "https://reg.example.com/service/info",
        appCode: "practice",
        appName: "Practice",
        group: { username: "practice", host: "example.com" },
        teams: [{ streamId: ":_cmc:apps:practice:team-a", name: "Team A" }, { streamId: ":_cmc:inbox", name: "x" }],
        invite: { displayName: "The practice", permissions: [{ streamId: "diary", level: "contribute" }], consent: { en: "ok" } },
        memberAccessTtl: 600,
      },
      envSettings({ VITE_SERVICE_INFO_URL: "https://other.example/service/info", VITE_ACCOUNT_APP_URL: "https://account.example.com/" }),
    );
    expect(c.serviceInfoUrl).toBe("https://reg.example.com/service/info");
    expect(c.accountAppUrl).toBe("https://account.example.com/");
    expect(c.appCode).toBe("practice");
    expect(c.group).toEqual({ username: "practice", host: "example.com" });
    expect(c.teams).toEqual([{ streamId: ":_cmc:apps:practice:team-a", name: "Team A" }]);
    expect(c.invite).toEqual({ displayName: "The practice", permissions: [{ streamId: "diary", level: "contribute" }], consent: { en: "ok" } });
    expect(c.memberAccessTtl).toBe(600);
  });

  it("[CFG3] drops invalid values instead of guessing", () => {
    const c = parseConfig({
      serviceInfoUrl: "javascript:alert(1)",
      accountAppUrl: "not a url",
      appCode: "Bad Code!",
      memberAccessTtl: 5,
      invite: { permissions: [{ streamId: ":_cmc:inbox", level: "read" }, { level: "read" }] },
    });
    expect(c.serviceInfoUrl).toBeNull();
    expect(c.accountAppUrl).toBeNull();
    expect(c.appCode).toBe(DEFAULT_CONFIG.appCode);
    expect(c.memberAccessTtl).toBe(DEFAULT_CONFIG.memberAccessTtl);
    // No CMC stream in an invite; nothing valid left: the default.
    expect(c.invite.permissions).toEqual(DEFAULT_CONFIG.invite.permissions);
    // The invite's display name falls back to the app name.
    expect(c.invite.displayName).toBe(DEFAULT_CONFIG.appName);
  });

  it("[CFG4] team streams: :_cmc:apps:<app>[:<path>], outside chats and collectors", () => {
    expect(isTeamStreamId(":_cmc:apps:practice")).toBe(true);
    expect(isTeamStreamId(":_cmc:apps:practice:team-a")).toBe(true);
    expect(isTeamStreamId(":_cmc:apps:practice:team-a:dr-who")).toBe(true);
    expect(isTeamStreamId(":_cmc:apps:practice:chats")).toBe(false);
    expect(isTeamStreamId(":_cmc:apps:practice:team-a:collectors:x--y")).toBe(false);
    expect(isTeamStreamId(":_cmc:inbox")).toBe(false);
    expect(isTeamStreamId(":_cmc:apps:")).toBe(false);
    expect(isTeamStreamId("diary")).toBe(false);
  });

  it("[CFG5] typed team ids: split, deduplicated, invalid ones reported", () => {
    expect(parseTeamIds(" :_cmc:apps:p:a\n:_cmc:apps:p:b, :_cmc:apps:p:a  diary")).toEqual({
      ids: [":_cmc:apps:p:a", ":_cmc:apps:p:b"],
      invalid: ["diary"],
    });
  });
});

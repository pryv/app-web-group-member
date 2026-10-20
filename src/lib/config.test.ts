import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, envSettings, getConfig, isTeamStreamId, loadConfig, parseConfig, parseTeamIds, serviceInfoUrlFromSearch, withAddressPlatform } from "./config";

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

describe("[CFP] platform named by the page address (?pryvServiceInfoUrl=)", () => {
  const SETTINGS_URL = "https://reg.example.com/service/info";
  const PARAM_URL = "https://other.example.org/reg/service/info";
  const q = (v: string) => "?pryvServiceInfoUrl=" + encodeURIComponent(v);

  it("[CFP1] the address wins over settings.json and the environment", () => {
    const c = withAddressPlatform(parseConfig({ serviceInfoUrl: SETTINGS_URL, appCode: "practice" }), q(PARAM_URL));
    expect(c.serviceInfoUrl).toBe(PARAM_URL);
    // Nothing else is read from the address.
    expect(c.appCode).toBe("practice");
    expect(withAddressPlatform(parseConfig({}, envSettings({ VITE_SERVICE_INFO_URL: SETTINGS_URL })), q(PARAM_URL)).serviceInfoUrl).toBe(PARAM_URL);
  });

  it("[CFP2] an invalid or empty value is ignored: settings.json still applies", () => {
    const base = parseConfig({ serviceInfoUrl: SETTINGS_URL });
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "not a url", "/relative/service/info", "  "]) {
      expect(serviceInfoUrlFromSearch(q(bad)), bad).toBeUndefined();
      expect(withAddressPlatform(base, q(bad)).serviceInfoUrl, bad).toBe(SETTINGS_URL);
    }
    expect(withAddressPlatform(base, "").serviceInfoUrl).toBe(SETTINGS_URL);
    expect(withAddressPlatform(base, "?lang=fr").serviceInfoUrl).toBe(SETTINGS_URL);
  });

  it("[CFP3] neither the address nor settings.json: no platform (the app says it is not configured)", () => {
    expect(withAddressPlatform(parseConfig({}), "").serviceInfoUrl).toBeNull();
    expect(withAddressPlatform(parseConfig({}), q("javascript:alert(1)")).serviceInfoUrl).toBeNull();
    expect(withAddressPlatform(parseConfig({}), q(PARAM_URL)).serviceInfoUrl).toBe(PARAM_URL);
  });
});

describe("[CFL] loading at boot", () => {
  const PARAM_URL = "https://other.example.org/reg/service/info";
  const settings = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("[CFL1] the address's platform over the loaded settings.json; settings.json alone otherwise", async () => {
    window.history.replaceState(null, "", "/?pryvServiceInfoUrl=" + encodeURIComponent(PARAM_URL) + "#/join");
    expect((await loadConfig(settings({ serviceInfoUrl: "https://reg.example.com/service/info" }))).serviceInfoUrl).toBe(PARAM_URL);
    expect((await loadConfig(settings({}))).serviceInfoUrl).toBe(PARAM_URL);
    expect(getConfig().serviceInfoUrl).toBe(PARAM_URL);
    window.history.replaceState(null, "", "/");
    expect((await loadConfig(settings({ serviceInfoUrl: "https://reg.example.com/service/info" }))).serviceInfoUrl).toBe("https://reg.example.com/service/info");
  });
});

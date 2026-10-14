import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import { describeError, errorId, KNOWN_ERROR_IDS, loggableError, redactUrls } from "./errors";
import { contentSummary, maskUrlCredentials } from "./display";

describe("[ERR] error ids to messages", () => {
  it("[ERR1] every catalogued id has an English message", () => {
    const errors = en.errors as Record<string, string>;
    for (const id of KNOWN_ERROR_IDS) expect(errors[id], id).toBeTruthy();
    expect(errors.generic).toBeTruthy();
  });

  it("[ERR2] reads the most specific id: CmcError, then a plugin id in innerObject.data, then the API id", () => {
    expect(errorId({ id: "cmc-member-access-in-flight" })).toBe("cmc-member-access-in-flight");
    expect(errorId({ innerObject: { id: "invalid-operation", data: { id: "cmc-member-access-rate-limited" } } })).toBe("cmc-member-access-rate-limited");
    expect(errorId({ innerObject: { id: "invalid-access-token" } })).toBe("invalid-access-token");
    expect(errorId(new TypeError("Failed to fetch"))).toBe("network");
    expect(errorId(new Error("boom"))).toBeNull();
  });

  it("[ERR3] an uncatalogued id falls back to the generic message, with the id for support", () => {
    expect(describeError({ id: "cmc-member-access-peer-rejected" })).toEqual({ key: "errors.cmc-member-access-peer-rejected", id: "cmc-member-access-peer-rejected" });
    expect(describeError({ id: "something-new" })).toEqual({ key: "errors.generic", id: "something-new" });
  });

  it("[ERR4] logs carry the id only, never a message or a URL", () => {
    const err = Object.assign(new Error("call to https://tok@core.test/ failed"), { id: "cmc-member-access-peer-rejected" });
    expect(loggableError(err)).toBe("cmc-member-access-peer-rejected");
    expect(loggableError(new Error("https://tok@core.test/"))).toBe("unidentified error");
    expect(redactUrls("see https://tok@core.test/x and tok@core.test")).toBe("see <url> and <redacted>");
  });

  it("[ERR5] displayed contents have URL credentials masked", () => {
    expect(maskUrlCredentials("go to https://secret@core.test/user/")).toBe("go to https://***@core.test/user/");
    expect(maskUrlCredentials("https%3A%2F%2Fsecret%40core.test")).toBe("https%3A%2F%2F***%40core.test");
    expect(contentSummary({ link: "https://secret@core.test/" })).not.toContain("secret");
    expect(contentSummary("x".repeat(500)).length).toBe(160);
  });
});

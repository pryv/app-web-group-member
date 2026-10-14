/**
 * A scripted stand-in for `pryv.Connection`: each call goes to a handler that
 * plays the core behind the endpoint. The real `@pryv/cmc` functions run on
 * top of it, so the tests exercise the client calls the app really makes.
 *
 *   vi.mock("../lib/pryvClient", async (orig) => withFakePryv(await orig()));
 *   cores.handle = (endpoint, method, params) => ({ events: [] });
 */

export interface Call {
  endpoint: string;
  method: string;
  params: Record<string, unknown>;
}

type Handler = (endpoint: string, method: string, params: Record<string, unknown>) => unknown;

export const cores: { handle: Handler; accessInfo: (endpoint: string) => unknown; calls: Call[] } = {
  handle: () => ({ error: { id: "unknown-resource", message: "unscripted" } }),
  accessInfo: () => ({ type: "app", user: { username: "member" }, permissions: [] }),
  calls: [],
};

export function resetCores(): void {
  cores.handle = () => ({ error: { id: "unknown-resource", message: "unscripted" } });
  cores.accessInfo = () => ({ type: "app", user: { username: "member" }, permissions: [] });
  cores.calls = [];
}

class FakePryvError extends Error {
  innerObject: unknown;
  constructor(inner: unknown) {
    super("api error");
    this.innerObject = inner;
  }
}

export class FakeConnection {
  apiEndpoint: string;
  constructor(apiEndpoint: string) {
    this.apiEndpoint = apiEndpoint;
  }
  async accessInfo() {
    const r = cores.accessInfo(this.apiEndpoint) as { error?: unknown };
    if (r && typeof r === "object" && "error" in r && r.error) throw new FakePryvError(r.error);
    return r;
  }
  private run(method: string, params: Record<string, unknown>): Record<string, unknown> {
    cores.calls.push({ endpoint: this.apiEndpoint, method, params });
    return cores.handle(this.apiEndpoint, method, params) as Record<string, unknown>;
  }
  async api(calls: Array<{ method: string; params: Record<string, unknown> }>) {
    return calls.map((c) => this.run(c.method, c.params));
  }
  async apiOne(method: string, params: Record<string, unknown>, key?: string) {
    const r = this.run(method, params);
    if (r && r.error) throw new FakePryvError(r.error);
    return key ? r[key] : r;
  }
}

/** The `pryvClient` module with `Pryv.Connection` replaced. */
export function withFakePryv<T extends Record<string, unknown>>(actual: T): T {
  const Pryv = actual.Pryv as Record<string, unknown>;
  return { ...actual, Pryv: { ...Pryv, Connection: FakeConnection } };
}

/** A token-bearing endpoint for `user` on the test platform. */
export function endpoint(token: string, user: string): string {
  return `https://${token}@${user}.example.test/`;
}

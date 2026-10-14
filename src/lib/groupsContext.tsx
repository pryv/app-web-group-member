import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pryv, type Connection } from "./pryvClient";
import { listGroups, type GroupRecord } from "./groups";
import { prunePending, readPending } from "./pendingGroups";
import { getConfig } from "./config";
import { useSignedIn } from "./session";

interface GroupsApi {
  groups: GroupRecord[] | null;
  error: unknown;
  loading: boolean;
  refresh: () => Promise<GroupRecord[] | null>;
  /** A connection on the membership (memory only), or null when not a member. */
  membershipConnection: (g: GroupRecord) => Connection | null;
}

const GroupsContext = createContext<GroupsApi | null>(null);

/** The member's groups, read once per visit and on demand. */
export function GroupsProvider({ children }: { children: ReactNode }) {
  const { connection, username } = useSignedIn();
  const [groups, setGroups] = useState<GroupRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const connections = useRef(new Map<string, { endpoint: string; conn: Connection }>());

  const read = useCallback(async () => {
    const list = await listGroups(connection, getConfig().appCode, readPending(username));
    prunePending(username, list.filter((g) => g.phase === "waiting").map((g) => g.inviteEventId));
    return list;
  }, [connection, username]);

  useEffect(() => {
    let cancelled = false;
    read().then(
      (list) => {
        if (cancelled) return;
        setGroups(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [read]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await read();
      setGroups(list);
      setError(null);
      return list;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [read]);

  const membershipConnection = useCallback((g: GroupRecord) => {
    if (g.membershipApiEndpoint == null) return null;
    const cached = connections.current.get(g.inviteEventId);
    if (cached && cached.endpoint === g.membershipApiEndpoint) return cached.conn;
    const conn = new Pryv.Connection(g.membershipApiEndpoint);
    connections.current.set(g.inviteEventId, { endpoint: g.membershipApiEndpoint, conn });
    return conn;
  }, []);

  const api = useMemo(
    () => ({ groups, error, loading, refresh, membershipConnection }),
    [groups, error, loading, refresh, membershipConnection],
  );
  return <GroupsContext.Provider value={api}>{children}</GroupsContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components -- the provider's hook lives beside it
export function useGroups(): GroupsApi {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error("useGroups outside GroupsProvider");
  return ctx;
}

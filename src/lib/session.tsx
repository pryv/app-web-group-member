import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pryv, type Connection } from "./pryvClient";
import { clearSession, readSession, stripQuery, writeSession } from "./sessionStore";
import { usernameOf } from "./signIn";
import { errorId, loggableError } from "./errors";

export type SessionState =
  | { status: "loading" }
  | { status: "signed-out"; expired?: boolean }
  | {
      status: "signed-in";
      connection: Connection;
      username: string;
      serviceInfoUrl: string;
      authUrl: string | null;
    };

interface SessionApi {
  state: SessionState;
  /** Keep a connection obtained by signing in. */
  establish: (connection: Connection, serviceInfoUrl: string, authUrl: string | null) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [stored] = useState(readSession);
  const [state, setState] = useState<SessionState>(stored == null ? { status: "signed-out" } : { status: "loading" });

  useEffect(() => {
    if (stored == null) return;
    let cancelled = false;
    const connection = new Pryv.Connection(stored.apiEndpoint);
    usernameOf(connection)
      .then((username) => {
        if (!cancelled) setState({ status: "signed-in", connection, username, serviceInfoUrl: stored.serviceInfoUrl, authUrl: stored.authUrl });
      })
      .catch((err) => {
        if (cancelled) return;
        const id = errorId(err);
        if (id === "invalid-access-token" || id === "forbidden") {
          clearSession();
          setState({ status: "signed-out", expired: true });
        } else {
          console.warn("group-member: could not check the session:", loggableError(err));
          setState({ status: "signed-out" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stored]);

  const establish = useCallback(async (connection: Connection, serviceInfoUrl: string, authUrl: string | null) => {
    const username = await usernameOf(connection);
    const cleanAuthUrl = authUrl ? stripQuery(authUrl) : null;
    writeSession({ apiEndpoint: connection.apiEndpoint, serviceInfoUrl, authUrl: cleanAuthUrl });
    setState({ status: "signed-in", connection, username, serviceInfoUrl, authUrl: cleanAuthUrl });
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setState({ status: "signed-out" });
  }, []);

  const api = useMemo(() => ({ state, establish, signOut }), [state, establish, signOut]);
  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components -- the provider's hooks live beside it
export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/** The signed-in session; only inside the signed-in part of the app. */
// oxlint-disable-next-line react/only-export-components -- the provider's hooks live beside it
export function useSignedIn(): Extract<SessionState, { status: "signed-in" }> {
  const { state } = useSession();
  if (state.status !== "signed-in") throw new Error("useSignedIn while not signed in");
  return state;
}

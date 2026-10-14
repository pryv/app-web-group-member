import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Layout from "./components/Layout";
import { useSession } from "./lib/session";
import { GroupsProvider } from "./lib/groupsContext";
import SignIn from "./routes/SignIn";
import Groups from "./routes/Groups";
import JoinGroup from "./routes/JoinGroup";
import Group from "./routes/Group";
import Patient from "./routes/Patient";

/**
 * Routes (hash-based, so the app is served as static files from any path):
 *   #/                                  the member's groups
 *   #/join                              ask to join a group
 *   #/groups/<request id>               one group (hand-off, or teams and patients)
 *   #/groups/<request id>/patients/<invite id>   one patient's data
 * No address carries a credential.
 */
export default function App() {
  const { t } = useTranslation();
  const { state } = useSession();
  return (
    <Layout>
      {state.status === "loading" && <p className="text-sm text-muted">{t("common.loading")}</p>}
      {state.status === "signed-out" && <SignIn expired={state.expired} />}
      {state.status === "signed-in" && (
        <GroupsProvider key={state.username}>
          <Routes>
            <Route path="/" element={<Groups />} />
            <Route path="/join" element={<JoinGroup />} />
            <Route path="/groups/:id" element={<Group />} />
            <Route path="/groups/:id/patients/:inviteId" element={<Patient />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </GroupsProvider>
      )}
    </Layout>
  );
}

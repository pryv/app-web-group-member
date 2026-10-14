import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button, Card, Field, PageTitle } from "../components/ui";
import { ErrorMessage } from "../components/common";
import { cmc } from "../lib/pryvClient";
import { getConfig, parseTeamIds } from "../lib/config";
import { useSignedIn } from "../lib/session";
import { useGroups } from "../lib/groupsContext";
import { rememberPending } from "../lib/pendingGroups";
import { loggableError } from "../lib/errors";

/**
 * Ask to join a group: a membership request written on the member's own
 * account. Its link is then handed to an administrator of the group (next
 * page: QR code and link).
 */
export default function JoinGroup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { connection, username } = useSignedIn();
  const { refresh } = useGroups();
  const config = getConfig();
  const [groupUsername, setGroupUsername] = useState(config.group?.username ?? "");
  const [groupHost, setGroupHost] = useState(config.group?.host ?? "");
  const [displayName, setDisplayName] = useState(username);
  const [checked, setChecked] = useState<string[]>(config.teams.map((tm) => tm.streamId));
  const [typedTeams, setTypedTeams] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFormError(null);
    const typed = parseTeamIds(typedTeams);
    if (typed.invalid.length > 0) {
      setFormError(t("join.invalidTeams", { ids: typed.invalid.join(", "), app: config.appCode }));
      return;
    }
    const scopeStreamIds = config.teams.length > 0 ? checked : typed.ids;
    if (scopeStreamIds.length === 0) {
      setFormError(t("join.noTeam"));
      return;
    }
    const group = { username: groupUsername.trim().toLowerCase(), host: groupHost.trim().toLowerCase() };
    if (!group.username || !group.host) {
      setFormError(t("join.noGroup"));
      return;
    }
    setBusy(true);
    try {
      const request = await cmc.requestMembership(connection, {
        group,
        scopeStreamIds,
        appCode: config.appCode,
        displayName: displayName.trim() || username,
      });
      rememberPending(username, request.inviteEventId, group);
      await refresh();
      navigate(`/groups/${encodeURIComponent(request.inviteEventId)}`);
    } catch (err) {
      console.warn("group-member: membership request failed:", loggableError(err));
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={14} aria-hidden />
        {t("common.back")}
      </Link>
      <PageTitle>{t("join.title")}</PageTitle>
      <Card>
        <p className="mt-0 text-sm text-muted">{t("join.intro")}</p>
        {error != null && <ErrorMessage error={error} />}
        {formError != null && <p className="text-sm text-danger" role="alert">{formError}</p>}
        <form onSubmit={(e) => void submit(e)} noValidate>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field id="group-username" label={t("join.groupUsername")} value={groupUsername} onChange={(e) => setGroupUsername(e.target.value)} autoComplete="off" required />
            <Field id="group-host" label={t("join.groupHost")} value={groupHost} onChange={(e) => setGroupHost(e.target.value)} autoComplete="off" placeholder="pryv.example" required />
          </div>
          {config.teams.length > 0 ? (
            <fieldset className="mb-4">
              <legend className="mb-1 text-sm font-medium text-muted">{t("join.teams")}</legend>
              {config.teams.map((team) => (
                <label key={team.streamId} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={checked.includes(team.streamId)}
                    onChange={(e) =>
                      setChecked((c) => (e.target.checked ? [...c, team.streamId] : c.filter((x) => x !== team.streamId)))
                    }
                  />
                  {team.name}
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="mb-4">
              <label htmlFor="team-ids" className="mb-1 block text-sm font-medium text-muted">
                {t("join.teamIds")}
              </label>
              <textarea
                id="team-ids"
                rows={3}
                value={typedTeams}
                onChange={(e) => setTypedTeams(e.target.value)}
                placeholder={`:_cmc:apps:${config.appCode}:team-a`}
                className="w-full rounded border border-divider bg-card px-3 py-2 font-mono text-xs text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
              />
              <p className="mt-1 text-xs text-muted">{t("join.teamIdsHint")}</p>
            </div>
          )}
          <Field id="display-name" label={t("join.displayName")} hint={t("join.displayNameHint")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <Button type="submit" disabled={busy}>
            {busy ? t("common.working") : t("join.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}

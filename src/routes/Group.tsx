import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight, LogOut, RefreshCw, UserPlus } from "lucide-react";
import { Alert, Badge, Button, Card, PageTitle } from "../components/ui";
import { ErrorMessage } from "../components/common";
import { InviteHandoff, MembershipHandoff } from "../components/Handoff";
import { useConfirm } from "../components/ConfirmDialog";
import { PhaseBadge } from "./Groups";
import { cmc, cmcErrorIds, type Connection } from "../lib/pryvClient";
import { getConfig } from "../lib/config";
import { useSignedIn } from "../lib/session";
import { useGroups } from "../lib/groupsContext";
import type { GroupRecord } from "../lib/groups";
import { invitePatient, listRoster, membershipTeams, type Team, type TeamRoster } from "../lib/patients";
import { resolveAccountApp } from "../lib/handoffLink";
import { actorLabel, formatTime } from "../lib/display";
import { errorId, loggableError } from "../lib/errors";

/** Polls the member's inbox for the group's acceptance while the page is open. */
function useWaitForAcceptance(g: GroupRecord) {
  const { connection } = useSignedIn();
  const { refresh } = useGroups();
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (g.phase !== "waiting") return;
    let cancelled = false;
    const group = g.group;
    void (async () => {
      while (!cancelled) {
        if (group == null) {
          // The group is not known on this browser: watch the request itself.
          await new Promise((r) => setTimeout(r, 5000));
          if (!cancelled) await refresh();
          continue;
        }
        try {
          await cmc.waitForMembership(connection, {
            group,
            appCode: getConfig().appCode,
            sinceTime: g.requestedAt ?? undefined,
            timeoutMs: 5000,
            intervalMs: 2500,
          });
          if (!cancelled) await refresh();
          return;
        } catch (err) {
          if ((err as { id?: string })?.id === cmcErrorIds.CAPABILITY_TIMEOUT) continue;
          if (!cancelled) setError(err);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, g.phase, g.group, g.requestedAt, refresh]);
  return error;
}

function WaitingView({ g }: { g: GroupRecord }) {
  const { t, i18n } = useTranslation();
  const { serviceInfoUrl, authUrl } = useSignedIn();
  const error = useWaitForAcceptance(g);
  const accountApp = resolveAccountApp(getConfig().accountAppUrl, authUrl, serviceInfoUrl);
  return (
    <Card>
      <h2>{t("group.waitingTitle")}</h2>
      {error != null && <ErrorMessage error={error} />}
      {g.capabilityUrl ? (
        <MembershipHandoff capabilityUrl={g.capabilityUrl} accountAppUrl={accountApp} />
      ) : (
        <Alert tone="warning">{t("group.noLink")}</Alert>
      )}
      <p className="text-sm text-muted" data-testid="waiting-status">
        {t("group.waiting")}
        {g.expiresAt != null && " " + t("group.expiresOn", { date: formatTime(g.expiresAt, i18n.language) })}
      </p>
    </Card>
  );
}

function EndedView({ g }: { g: GroupRecord }) {
  const { t } = useTranslation();
  return (
    <Card>
      <p className="m-0 text-sm" data-testid="ended-status">
        {t(`group.ended.${g.status}`, { defaultValue: t("group.ended.other") })}
      </p>
    </Card>
  );
}

function TeamSection({
  team,
  roster,
  membership,
  groupKey,
  accountApp,
  onChanged,
}: {
  team: Team;
  roster: TeamRoster;
  membership: Connection;
  groupKey: string;
  accountApp: string | null;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const config = getConfig();
  const [created, setCreated] = useState<{ capabilityUrl: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [openInvite, setOpenInvite] = useState<string | null>(null);
  const patients = roster.patients.filter((p) => p.team.streamId === team.streamId);
  const waiting = roster.waiting.filter((p) => p.team.streamId === team.streamId);
  const patientScope = cmc.appScope(config.appCode);

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await invitePatient(membership, { appCode: config.appCode, team, invite: config.invite });
      setCreated({ capabilityUrl: res.capabilityUrl });
      onChanged();
    } catch (err) {
      console.warn("group-member: invite failed:", loggableError(err));
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4" data-testid="team-section" aria-label={team.name}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0">{team.name}</h2>
        <Button variant="secondary" onClick={() => void invite()} disabled={busy}>
          <UserPlus size={14} aria-hidden />
          {busy ? t("common.working") : t("group.invite")}
        </Button>
      </div>
      {error != null && <ErrorMessage error={error} />}
      {created && (
        <Alert tone="success">
          <p className="mt-0">{t("group.invited")}</p>
          <InviteHandoff capabilityUrl={created.capabilityUrl} accountAppUrl={accountApp} patientScopeStreamId={patientScope} idPrefix={`new-${team.streamId}`} />
        </Alert>
      )}
      <h3>{t("group.patients")}</h3>
      {patients.length === 0 ? (
        <p className="text-sm text-muted">{t("group.noPatients")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {patients.map((p) => (
            <li key={p.inviteEventId}>
              <Link
                to={`/groups/${encodeURIComponent(groupKey)}/patients/${encodeURIComponent(p.inviteEventId)}`}
                className="flex items-center justify-between rounded border border-divider px-3 py-2 text-ink no-underline hover:border-primary hover:no-underline"
                data-testid="patient-row"
              >
                <span>
                  <span className="block font-medium">{actorLabel(p.counterparty)}</span>
                  {p.acceptedAt != null && (
                    <span className="block text-xs text-muted">{t("group.acceptedOn", { date: formatTime(p.acceptedAt, i18n.language) })}</span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 text-sm text-primary">
                  {t("group.open")}
                  <ChevronRight size={14} aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {waiting.length > 0 && (
        <>
          <h3 className="mt-4">{t("group.waitingInvites")}</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {waiting.map((w) => (
              <li key={w.inviteEventId} className="rounded border border-divider px-3 py-2" data-testid="waiting-invite">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <Badge tone="info">{t(`group.inviteStatus.${w.status}`, { defaultValue: w.status })}</Badge>
                    {w.expiresAt != null && <span className="ml-2 text-xs text-muted">{t("group.expiresOn", { date: formatTime(w.expiresAt, i18n.language) })}</span>}
                  </span>
                  {w.capabilityUrl && openInvite !== w.inviteEventId && (
                    <Button variant="ghost" className="px-0" onClick={() => setOpenInvite(w.inviteEventId)}>
                      {t("group.showInvite")}
                    </Button>
                  )}
                </div>
                {w.capabilityUrl && openInvite === w.inviteEventId && (
                  <div className="mt-2">
                    <InviteHandoff capabilityUrl={w.capabilityUrl} accountAppUrl={accountApp} patientScopeStreamId={patientScope} idPrefix={w.inviteEventId} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function MemberView({ g }: { g: GroupRecord }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { connection, serviceInfoUrl, authUrl } = useSignedIn();
  const { membershipConnection, refresh } = useGroups();
  const [confirm, dialog] = useConfirm();
  const membership = membershipConnection(g);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [roster, setRoster] = useState<TeamRoster | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [leaveError, setLeaveError] = useState<unknown>(null);
  const [leaving, setLeaving] = useState(false);
  const accountApp = resolveAccountApp(getConfig().accountAppUrl, authUrl, serviceInfoUrl);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (membership == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const ts = await membershipTeams(membership);
        const r = await listRoster(membership, ts);
        if (cancelled) return;
        setTeams(ts);
        setRoster(r);
        setError(null);
      } catch (err) {
        console.warn("group-member: could not read the group:", loggableError(err));
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [membership, version]);

  const leave = async () => {
    const name = actorLabel(g.group);
    if (!(await confirm(t("group.leaveConfirm", { group: name }), { confirmLabel: t("group.leave"), danger: true }))) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await cmc.leaveMembership(connection, { inviteEventId: g.inviteEventId });
      await refresh();
      navigate("/", { replace: true, state: { notice: "left", group: name } });
    } catch (err) {
      console.warn("group-member: leaving failed:", loggableError(err));
      setLeaveError(err);
    } finally {
      setLeaving(false);
    }
  };

  const gone = errorId(error) === "invalid-access-token";
  return (
    <div>
      {gone ? (
        <Alert tone="warning">{t("group.membershipGone")}</Alert>
      ) : (
        error != null && <ErrorMessage error={error} onRetry={load} />
      )}
      {teams == null && error == null && <p className="text-sm text-muted">{t("common.loading")}</p>}
      {teams != null && teams.length === 0 && <Alert tone="info">{t("group.noTeams")}</Alert>}
      {teams != null && roster != null && membership != null && (
        <>
          <div className="mb-3 flex justify-end">
            <Button variant="secondary" onClick={load}>
              <RefreshCw size={14} aria-hidden />
              {t("common.refresh")}
            </Button>
          </div>
          {teams.map((team) => (
            <TeamSection key={team.streamId} team={team} roster={roster} membership={membership} groupKey={g.inviteEventId} accountApp={accountApp} onChanged={load} />
          ))}
        </>
      )}
      <Card className="mt-6">
        <h2>{t("group.leaveTitle")}</h2>
        <p className="text-sm text-muted">{t("group.leaveIntro")}</p>
        {leaveError != null && <ErrorMessage error={leaveError} />}
        <Button variant="danger" onClick={() => void leave()} disabled={leaving}>
          <LogOut size={14} aria-hidden />
          {leaving ? t("common.working") : t("group.leave")}
        </Button>
      </Card>
      {dialog}
    </div>
  );
}

/** One group: the hand-off while the request waits, the teams and patients once a member. */
export default function Group() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { groups, error, refresh } = useGroups();
  const g = groups?.find((x) => x.inviteEventId === id) ?? null;

  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={14} aria-hidden />
        {t("groups.title")}
      </Link>
      {error != null && <ErrorMessage error={error} onRetry={() => void refresh()} />}
      {groups == null && error == null && <p className="text-sm text-muted">{t("common.loading")}</p>}
      {groups != null && g == null && <Alert tone="warning">{t("group.notFound")}</Alert>}
      {g != null && (
        <>
          <PageTitle action={<PhaseBadge g={g} />}>
            <span data-testid="group-name">{actorLabel(g.group) || t("groups.unknownGroup")}</span>
          </PageTitle>
          {g.phase === "waiting" && <WaitingView g={g} />}
          {g.phase === "arriving" && (
            <Alert tone="info">
              {t("group.arriving")}{" "}
              <Button variant="ghost" className="px-0" onClick={() => void refresh()}>
                {t("common.refresh")}
              </Button>
            </Alert>
          )}
          {g.phase === "ended" && <EndedView g={g} />}
          {g.phase === "member" && <MemberView g={g} />}
        </>
      )}
    </div>
  );
}


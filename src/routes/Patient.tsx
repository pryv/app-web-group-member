import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Alert, Button, Card, PageTitle } from "../components/ui";
import { ErrorMessage } from "../components/common";
import { cmc, type Connection } from "../lib/pryvClient";
import { getConfig } from "../lib/config";
import { useGroups } from "../lib/groupsContext";
import { isUnder, membershipTeams, type TeamInvite } from "../lib/patients";
import { readTimeline, requestPatientAccess, type OpenedPatient, type PatientEvent } from "../lib/memberAccess";
import { actorLabel, contentSummary, formatTime } from "../lib/display";
import { loggableError } from "../lib/errors";

const PAGE = 30;

/** The patient's invite and team, read through the membership. */
async function findPatient(membership: Connection, inviteEventId: string): Promise<TeamInvite | null> {
  const [teams, invite] = await Promise.all([membershipTeams(membership), cmc.getInviteStatus(membership, inviteEventId)]);
  const team = [...teams].sort((a, b) => b.streamId.length - a.streamId.length).find((tm) => isUnder(invite.scopeStreamId, tm.streamId));
  if (team == null || invite.counterparty == null) return null;
  return { ...invite, team };
}

type Phase =
  | { step: "asking" }
  | { step: "open"; opened: OpenedPatient }
  | { step: "failed"; error: unknown }
  | { step: "expired"; access: OpenedPatient["access"] };

interface Timeline {
  events: PatientEvent[];
  streamNames: Map<string, string>;
  more: boolean;
  error: unknown;
}

const EMPTY_TIMELINE: Timeline = { events: [], streamNames: new Map(), more: false, error: null };

/**
 * One patient's data, read directly from the patient's core under a member
 * access: an access on the patient's account, created for this member by the
 * group's core and named after them. Its endpoint lives in this page's state
 * (memory) and goes when the page does: never in storage, the address or a log.
 */
export default function Patient() {
  const { t, i18n } = useTranslation();
  const { id = "", inviteId = "" } = useParams();
  const { groups, membershipConnection } = useGroups();
  const g = groups?.find((x) => x.inviteEventId === id) ?? null;
  const membership = g ? membershipConnection(g) : null;
  const [patient, setPatient] = useState<TeamInvite | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "asking" });
  const [attempt, setAttempt] = useState(0);
  const [timeline, setTimeline] = useState<Timeline>(EMPTY_TIMELINE);

  // Ask the group's core for an access (again on each attempt).
  useEffect(() => {
    if (membership == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await findPatient(membership, inviteId);
        if (cancelled) return;
        if (p == null) {
          setPhase({ step: "failed", error: { id: "unknown-resource" } });
          return;
        }
        setPatient(p);
        const opened = await requestPatientAccess(membership, p, {
          expireAfter: getConfig().memberAccessTtl,
          isCancelled: () => cancelled,
        });
        if (!cancelled) setPhase({ step: "open", opened });
      } catch (err) {
        if (cancelled) return;
        console.warn("group-member: member access failed:", loggableError(err));
        setPhase({ step: "failed", error: err });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [membership, inviteId, attempt]);

  const connection = phase.step === "open" ? phase.opened.connection : null;

  // First page of the timeline once the access is there.
  useEffect(() => {
    if (connection == null) return;
    let cancelled = false;
    readTimeline(connection, { limit: PAGE })
      .then((page) => {
        if (!cancelled) setTimeline({ events: page.events, streamNames: page.streamNames, more: page.events.length >= PAGE, error: null });
      })
      .catch((err) => {
        console.warn("group-member: could not read the patient's data:", loggableError(err));
        if (!cancelled) setTimeline({ ...EMPTY_TIMELINE, error: err });
      });
    return () => {
      cancelled = true;
    };
  }, [connection]);

  // Past its expiry the access is refused: drop it and offer to ask again.
  useEffect(() => {
    if (phase.step !== "open") return;
    const access = phase.opened.access;
    const ms = access.expires * 1000 - Date.now();
    const timer = setTimeout(() => setPhase({ step: "expired", access }), Math.max(0, Math.min(ms, 2 ** 31 - 1)));
    return () => clearTimeout(timer);
  }, [phase]);

  const askAgain = () => {
    setPhase({ step: "asking" });
    setTimeline(EMPTY_TIMELINE);
    setAttempt((a) => a + 1);
  };

  const loadPage = async (append: boolean) => {
    if (connection == null) return;
    const toTime = append && timeline.events.length > 0 ? timeline.events[timeline.events.length - 1].time : undefined;
    try {
      const page = await readTimeline(connection, { limit: PAGE, toTime });
      setTimeline((prev) => {
        const seen = new Set(append ? prev.events.map((e) => e.id) : []);
        const events = append ? [...prev.events, ...page.events.filter((e) => !seen.has(e.id))] : page.events;
        return { events, streamNames: page.streamNames, more: page.events.length >= PAGE, error: null };
      });
    } catch (err) {
      console.warn("group-member: could not read the patient's data:", loggableError(err));
      setTimeline((prev) => ({ ...prev, error: err }));
    }
  };

  const backLink = (
    <Link to={`/groups/${encodeURIComponent(id)}`} className="mb-3 inline-flex items-center gap-1 text-sm">
      <ArrowLeft size={14} aria-hidden />
      {g ? actorLabel(g.group) : t("groups.title")}
    </Link>
  );

  if (groups != null && (g == null || membership == null)) {
    return (
      <div>
        {backLink}
        <Alert tone="warning">{t("patient.noMembership")}</Alert>
      </div>
    );
  }

  return (
    <div>
      {backLink}
      <PageTitle>
        <span data-testid="patient-name">{patient ? actorLabel(patient.counterparty) : t("patient.title")}</span>
      </PageTitle>
      {phase.step === "asking" && (
        <p className="text-sm text-muted" data-testid="patient-asking">
          {t("patient.asking")}
        </p>
      )}
      {phase.step === "failed" && <ErrorMessage error={phase.error} onRetry={askAgain} />}
      {phase.step === "expired" && (
        <Alert tone="info">
          {t("patient.expired")}{" "}
          <Button variant="ghost" className="px-0" onClick={askAgain}>
            {t("patient.askAgain")}
          </Button>
        </Alert>
      )}
      {phase.step === "open" && (
        <>
          <Card className="mb-4" data-testid="member-access">
            <p className="m-0 text-sm">
              {t("patient.accessLine", { team: patient?.team.name ?? "", date: formatTime(phase.opened.access.expires, i18n.language) })}
            </p>
            <p className="m-0 mt-1 text-xs text-muted">
              {t("patient.accessName")} <code>{phase.opened.access.name}</code>
            </p>
            {phase.opened.access.attribution === "name-only" ? (
              <p className="m-0 mt-2 text-xs text-warning" data-testid="attribution-name-only">
                {t("patient.nameOnly")}
              </p>
            ) : (
              <p className="m-0 mt-2 text-xs text-muted">{t("patient.stamped")}</p>
            )}
          </Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="m-0">{t("patient.timeline")}</h2>
            <Button variant="secondary" onClick={() => void loadPage(false)}>
              <RefreshCw size={14} aria-hidden />
              {t("common.refresh")}
            </Button>
          </div>
          {timeline.error != null && <ErrorMessage error={timeline.error} />}
          {timeline.events.length === 0 && timeline.error == null ? (
            <p className="text-sm text-muted">{t("patient.noEvents")}</p>
          ) : (
            <ol className="m-0 list-none p-0" aria-label={t("patient.timeline")}>
              {timeline.events.map((e) => (
                <li key={e.id} className="border-b border-divider py-2 text-sm" data-testid="timeline-event">
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
                    <span>{formatTime(e.time, i18n.language)}</span>
                    <span>
                      {(e.streamIds ?? []).map((s) => timeline.streamNames.get(s) ?? s).join(", ")} <code>{e.type}</code>
                    </span>
                  </div>
                  <div className="break-words">{contentSummary(e.content)}</div>
                </li>
              ))}
            </ol>
          )}
          {timeline.more && (
            <Button variant="secondary" className="mt-3" onClick={() => void loadPage(true)}>
              {t("patient.older")}
            </Button>
          )}
          <p className="mt-4 text-xs text-muted">{t("patient.readOnly")}</p>
        </>
      )}
    </div>
  );
}

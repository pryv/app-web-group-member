import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Alert, Badge, Button, Card, PageTitle } from "../components/ui";
import { ErrorMessage } from "../components/common";
import { useGroups } from "../lib/groupsContext";
import type { GroupRecord } from "../lib/groups";
import { actorLabel, formatTime } from "../lib/display";
import { shortName } from "../lib/patients";

export function PhaseBadge({ g }: { g: GroupRecord }) {
  const { t } = useTranslation();
  if (g.phase === "member") return <Badge tone="success">{t("groups.phase.member")}</Badge>;
  if (g.phase === "arriving") return <Badge tone="info">{t("groups.phase.arriving")}</Badge>;
  if (g.phase === "waiting") return <Badge tone="info">{t("groups.phase.waiting")}</Badge>;
  return <Badge>{t(`groups.status.${g.status}`, { defaultValue: t("groups.phase.ended") })}</Badge>;
}

function GroupRow({ g }: { g: GroupRecord }) {
  const { t, i18n } = useTranslation();
  const name = actorLabel(g.group) || t("groups.unknownGroup");
  return (
    <li>
      <Link
        to={`/groups/${encodeURIComponent(g.inviteEventId)}`}
        className="flex items-center justify-between gap-3 rounded border border-divider bg-card px-4 py-3 text-ink no-underline hover:border-primary hover:no-underline"
        data-testid="group-row"
      >
        <span className="min-w-0">
          <span className="block font-medium">{name}</span>
          <span className="block text-xs text-muted">
            {g.requestedTeams.map(shortName).join(", ")}
            {g.requestedAt != null && ` · ${t("groups.requestedOn", { date: formatTime(g.requestedAt, i18n.language) })}`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <PhaseBadge g={g} />
          <ChevronRight size={14} aria-hidden />
        </span>
      </Link>
    </li>
  );
}

/** Home: the member's groups and requests. */
export default function Groups() {
  const { t } = useTranslation();
  const { groups, error, loading, refresh } = useGroups();
  const notice = useLocation().state as { notice?: string; group?: string } | null;
  const active = (groups ?? []).filter((g) => g.phase !== "ended");
  const ended = (groups ?? []).filter((g) => g.phase === "ended");

  return (
    <div>
      <PageTitle
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw size={14} aria-hidden />
              {t("common.refresh")}
            </Button>
            <Link to="/join" className="inline-flex items-center gap-1.5 rounded bg-primary px-4 py-2 text-sm font-medium text-white no-underline hover:no-underline hover:brightness-95">
              <Plus size={14} aria-hidden />
              {t("groups.join")}
            </Link>
          </div>
        }
      >
        {t("groups.title")}
      </PageTitle>
      {notice?.notice === "left" && <Alert tone="success">{t("groups.left", { group: notice.group ?? "" })}</Alert>}
      {error != null && <ErrorMessage error={error} onRetry={() => void refresh()} />}
      {groups == null && error == null && <p className="text-sm text-muted">{t("common.loading")}</p>}
      {groups != null && active.length === 0 && (
        <Card>
          <p className="m-0 text-sm">{t("groups.empty")}</p>
        </Card>
      )}
      {active.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={t("groups.title")}>
          {active.map((g) => (
            <GroupRow key={g.inviteEventId} g={g} />
          ))}
        </ul>
      )}
      {ended.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted">{t("groups.past", { count: ended.length })}</summary>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {ended.map((g) => (
              <GroupRow key={g.inviteEventId} g={g} />
            ))}
          </ul>
        </details>
      )}
      <div className="mt-6">
        <Alert tone="info">
          <span className="text-xs">{t("groups.trustNote")}</span>
        </Alert>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QrCode as QrIcon } from "lucide-react";
import { Button } from "./ui";
import { CopyField, QrCode } from "./common";
import { inviteLink, membershipLink } from "../lib/handoffLink";

/**
 * The membership request, ready to hand to a group administrator: a QR code
 * of the account-app link (the administrator's phone opens it, signs in to
 * the group and shows the request), the same link as text, and the bare
 * capability URL for the paste path.
 */
export function MembershipHandoff({ capabilityUrl, accountAppUrl }: { capabilityUrl: string; accountAppUrl: string | null }) {
  const { t } = useTranslation();
  const link = membershipLink(accountAppUrl, capabilityUrl);
  return (
    <div data-testid="membership-handoff">
      <p className="mt-0 text-sm">{link ? t("handoff.membershipIntro") : t("handoff.membershipIntroBare")}</p>
      <QrCode value={link ?? capabilityUrl} label={t("handoff.qrLabel")} testId="membership-qr" />
      {link && <CopyField id="membership-link" label={t("handoff.adminLink")} value={link} testId="membership-link" />}
      <CopyField id="membership-capability" label={t("handoff.capability")} value={capabilityUrl} testId="membership-capability" />
      <p className="text-xs text-muted">{t("handoff.capabilityNote")}</p>
    </div>
  );
}

/** A patient invite, ready to hand to the patient. */
export function InviteHandoff({
  capabilityUrl,
  accountAppUrl,
  patientScopeStreamId,
  idPrefix,
}: {
  capabilityUrl: string;
  accountAppUrl: string | null;
  patientScopeStreamId: string;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const [showQr, setShowQr] = useState(false);
  const link = inviteLink(accountAppUrl, capabilityUrl, patientScopeStreamId);
  return (
    <div data-testid="invite-handoff">
      <p className="mt-0 text-xs text-muted">{t("handoff.inviteIntro")}</p>
      {link && <CopyField id={`${idPrefix}-link`} label={t("handoff.patientLink")} value={link} testId="invite-link" />}
      <CopyField id={`${idPrefix}-capability`} label={t("handoff.capability")} value={capabilityUrl} testId="invite-capability" />
      {showQr ? (
        <QrCode value={link ?? capabilityUrl} label={t("handoff.inviteQrLabel")} testId="invite-qr" />
      ) : (
        <Button variant="secondary" onClick={() => setShowQr(true)}>
          <QrIcon size={14} aria-hidden />
          {t("handoff.showQr")}
        </Button>
      )}
    </div>
  );
}

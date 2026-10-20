import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { Alert, Button, Card } from "../components/ui";
import { ErrorMessage } from "../components/common";
import { getConfig } from "../lib/config";
import { useSession } from "../lib/session";
import { newService, startSignIn, waitForSignIn, type StartedSignIn } from "../lib/signIn";
import { loggableError } from "../lib/errors";

const POPUP_NAME = "group-member-sign-in";
const POPUP_FEATURES = "width=460,height=720";

/**
 * Sign in to the member's own account through the platform's auth page.
 * The page opens in a pop-up (or, when the browser blocks it, from a link
 * the member clicks) while this page waits for the answer.
 */
export default function SignIn({ expired }: { expired?: boolean }) {
  const { t, i18n } = useTranslation();
  const { establish } = useSession();
  const config = getConfig();
  const [started, setStarted] = useState<StartedSignIn | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const abort = useRef<AbortController | null>(null);
  const popup = useRef<Window | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const begin = async () => {
    const serviceInfoUrl = config.serviceInfoUrl;
    if (serviceInfoUrl == null) return;
    setError(null);
    setBlocked(false);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    // Opened at once, in the click: a pop-up opened after an await is blocked.
    popup.current = window.open("", POPUP_NAME, POPUP_FEATURES);
    try {
      const service = newService(serviceInfoUrl);
      const request = await startSignIn(service, config, i18n.language.split("-")[0] || "en");
      setStarted(request);
      if (popup.current && !popup.current.closed) popup.current.location.href = request.authUrl;
      else setBlocked(true);
      const connection = await waitForSignIn(service, request, { signal: controller.signal });
      popup.current?.close();
      await establish(connection, serviceInfoUrl, request.authUrl);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      popup.current?.close();
      console.warn("group-member: sign-in failed:", loggableError(err));
      setError(err);
      setStarted(null);
    }
  };

  const cancel = () => {
    abort.current?.abort();
    popup.current?.close();
    setStarted(null);
  };

  if (config.serviceInfoUrl == null) {
    return (
      <Card>
        <Alert tone="danger">{t(config.platformRefused ? "signIn.platformNotAllowed" : "signIn.notConfigured")}</Alert>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <h1>{t("signIn.title")}</h1>
      <p className="text-sm text-muted">{t("signIn.intro", { appName: config.appName })}</p>
      {expired && <Alert tone="info">{t("signIn.expired")}</Alert>}
      {error != null && <ErrorMessage error={error} />}
      {started == null ? (
        <Button className="w-full" onClick={() => void begin()}>
          {t("signIn.button")}
        </Button>
      ) : (
        <div data-testid="sign-in-waiting">
          <Alert tone="info">{t("signIn.waiting")}</Alert>
          {blocked && (
            <p className="text-sm">
              <a href={started.authUrl} target={POPUP_NAME} rel="noopener noreferrer"className="inline-flex items-center gap-1">
                <ExternalLink size={14} aria-hidden />
                {t("signIn.openPage")}
              </a>
            </p>
          )}
          <Button variant="secondary" className="w-full" onClick={cancel}>
            {t("common.cancel")}
          </Button>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">{t("signIn.permissions", { scope: `:_cmc:apps:${config.appCode}` })}</p>
    </Card>
  );
}

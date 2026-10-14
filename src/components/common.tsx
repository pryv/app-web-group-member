import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Alert, Button } from "./ui";
import { describeError } from "../lib/errors";
import { maskUrlCredentials } from "../lib/display";

/** An error as a readable message; an uncatalogued id is quoted for support. */
export function ErrorMessage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const { key, id } = describeError(error);
  return (
    <Alert tone="danger">
      <p className="m-0" data-testid="error-message">
        {t(key)}
        {key === "errors.generic" && id != null && (
          <>
            {" "}
            <code className="text-xs">{maskUrlCredentials(id)}</code>
          </>
        )}
      </p>
      {onRetry && (
        <Button variant="ghost" className="mt-1 px-0" onClick={onRetry}>
          {t("common.tryAgain")}
        </Button>
      )}
    </Alert>
  );
}

/** A read-only value with a Copy button (for links meant to be handed over). */
export function CopyField({ id, label, value, testId }: { id: string; label: string; value: string; testId?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused: the value stays selectable in the field.
    }
  };
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={value}
          data-testid={testId}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded border border-divider bg-body px-3 py-2 font-mono text-xs text-ink"
        />
        <Button variant="secondary" onClick={copy} aria-label={t("common.copyLabel", { label })}>
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
      </div>
    </div>
  );
}

/** A QR code on a white background (readable in both themes). */
export function QrCode({ value, label, testId }: { value: string; label: string; testId?: string }) {
  return (
    <div className="mb-3 inline-block rounded bg-white p-3" data-testid={testId}>
      <QRCodeSVG value={value} size={196} marginSize={0} title={label} role="img" aria-label={label} />
    </div>
  );
}

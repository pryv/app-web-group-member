import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialogBox";

/**
 * In-app confirmation dialog, used instead of `window.confirm()` (which blocks
 * the page and cannot follow the app's look or language).
 *
 *   const [confirm, dialog] = useConfirm();
 *   if (!(await confirm(t("group.leaveConfirm"), { confirmLabel: t("group.leave"), danger: true }))) return;
 *   return <>{dialog}...</>;
 *
 * Escape, Cancel and a click outside answer false.
 */
export function useConfirm(): [
  (message: ReactNode, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>,
  ReactNode,
] {
  const [pending, setPending] = useState<{ message: ReactNode; confirmLabel?: string; danger: boolean } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (message: ReactNode, opts?: { confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setPending({ message, confirmLabel: opts?.confirmLabel, danger: opts?.danger ?? false });
      }),
    [],
  );

  const answer = useCallback((ok: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setPending(null);
    resolve?.(ok);
  }, []);

  const dialog = pending ? (
    <ConfirmDialog message={pending.message} confirmLabel={pending.confirmLabel} danger={pending.danger} onAnswer={answer} />
  ) : null;
  return [confirm, dialog];
}

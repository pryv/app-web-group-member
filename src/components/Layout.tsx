import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { Logo } from "../brand";
import { getConfig } from "../lib/config";
import { useSession } from "../lib/session";
import { useConfirm } from "./ConfirmDialog";
import { Button } from "./ui";

export default function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { state, signOut } = useSession();
  const [confirm, dialog] = useConfirm();
  const appName = getConfig().appName;

  const onSignOut = async () => {
    if (await confirm(t("layout.signOutConfirm"), { confirmLabel: t("layout.signOut") })) signOut();
  };

  return (
    <div className="min-h-screen bg-body text-ink">
      <header className="border-b border-divider bg-card">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-ink no-underline hover:no-underline">
            <Logo className="text-primary" />
            <span className="font-heading text-lg font-medium">{appName}</span>
          </Link>
          {state.status === "signed-in" && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted" data-testid="signed-in-as">
                {t("layout.signedInAs", { username: state.username })}
              </span>
              <Button variant="ghost" className="px-2" onClick={onSignOut}>
                <LogOut size={14} aria-hidden />
                {t("layout.signOut")}
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      {dialog}
    </div>
  );
}

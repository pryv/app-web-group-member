import type { ReactNode } from "react";
import { Users } from "lucide-react";

/**
 * Branding seam. A deployment (or a fork) rebrands the app by replacing this
 * file and the colour tokens at the top of `index.css`; the app name itself
 * comes from `settings.json` (`appName`).
 */
export function Logo(props: { className?: string }): ReactNode {
  return <Users aria-hidden size={22} className={props.className} />;
}

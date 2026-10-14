import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

/**
 * Languages this build ships. To add one: drop `src/locales/<code>.json` next
 * to `en.json` with the same keys, import it below and list it here.
 * The language is `?lang=` on the page address when given, else the browser's.
 */
export const SUPPORTED_LOCALES = ["en"] as const;

function detect(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  const candidates = [fromQuery, ...(navigator.languages ?? [navigator.language])];
  for (const c of candidates) {
    const base = c?.split("-")[0];
    if (base && (SUPPORTED_LOCALES as readonly string[]).includes(base)) return base;
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  lng: detect(),
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LOCALES as unknown as string[],
  interpolation: { escapeValue: false },
  resources: { en: { translation: en } },
});

export default i18n;

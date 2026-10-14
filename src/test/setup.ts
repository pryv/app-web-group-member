// Loads the English catalog for every test, so components render their real strings.
import "../i18n";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});

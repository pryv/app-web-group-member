import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./index.css";
import "./i18n";
import App from "./App.tsx";
import { SessionProvider } from "./lib/session";
import { loadConfig } from "./lib/config";

// Read the deployment's settings.json before rendering (never rejects, never
// waits past its cap), so the configuration stays synchronous afterwards.
void loadConfig().then((config) => {
  document.title = config.appName;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <HashRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </HashRouter>
    </StrictMode>,
  );
});

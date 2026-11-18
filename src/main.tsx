import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import ThemedToaster from "./components/layout/ThemedToaster";
import { applyTheme, getThemePref, watchSystemTheme } from "./lib/theme";
import App from "./App";
import { AppProvider } from "./contexts/AppContext";
import { PlatformConfigProvider } from "./contexts/PlatformConfigContext";
import { installClientErrorReporting } from "./lib/clientErrors";
import "./index.css";

// Depois de uma publicação nova, uma aba antiga pode pedir uma tela que mudou de nome: recarrega uma vez só para pegar a versão nova.
window.addEventListener("vite:preloadError", (ev) => {
  try {
    if (sessionStorage.getItem("ile.reload.chunk")) return;
    sessionStorage.setItem("ile.reload.chunk", "1");
  } catch {
    return;
  }
  ev.preventDefault();
  (window as unknown as { __ileReloading?: boolean }).__ileReloading = true; // o erro "reading default" que sobra é só da tela antiga: não relatar
  window.location.reload();
});
window.addEventListener("load", () => {
  try {
    sessionStorage.removeItem("ile.reload.chunk");
  } catch {
    /* sem sessionStorage */
  }
});

installClientErrorReporting();
applyTheme(getThemePref());
watchSystemTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <PlatformConfigProvider>
          <App />
        </PlatformConfigProvider>
        <ThemedToaster />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);

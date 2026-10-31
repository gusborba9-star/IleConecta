import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import ThemedToaster from "./components/layout/ThemedToaster";
import { applyTheme, getThemePref, watchSystemTheme } from "./lib/theme";
import App from "./App";
import { AppProvider } from "./contexts/AppContext";
import { PlatformConfigProvider } from "./contexts/PlatformConfigContext";
import "./index.css";

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

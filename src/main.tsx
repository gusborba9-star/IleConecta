import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import { AppProvider } from "./contexts/AppContext";
import { PlatformConfigProvider } from "./contexts/PlatformConfigContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <PlatformConfigProvider>
          <App />
        </PlatformConfigProvider>
        <Toaster position="top-right" richColors closeButton />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);

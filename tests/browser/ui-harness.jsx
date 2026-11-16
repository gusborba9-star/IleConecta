// Monta UMA tela real do app isolada (sem login/rotas) para teste de navegador. Só roda no servidor de desenvolvimento; não entra no build.
import React from "react";
import ReactDOM from "react-dom/client";
import ThemedToaster from "../../src/components/layout/ThemedToaster";
import { ConfirmProvider } from "../../src/components/base/Confirm";
import { applyTheme, getThemePref } from "../../src/lib/theme";
import TaxIdCard from "../../src/components/house/TaxIdCard";
import SeatCard from "../../src/components/house/SeatCard";
import AdminTaxIdCard from "../../src/components/admin/AdminTaxIdCard";
import BillingAdminCard from "../../src/components/admin/BillingAdminCard";
import InvoicesCard from "../../src/components/house/InvoicesCard";
import OrdersCard from "../../src/components/house/OrdersCard";
import PendingCenterCard from "../../src/components/admin/PendingCenterCard";
import HousePendingCard from "../../src/components/house/HousePendingCard";
import { PeopleBoard } from "../../src/pages/Pessoas";
import { AppProvider } from "../../src/contexts/AppContext";
import { BrowserRouter } from "react-router-dom";
import "../../src/index.css";

applyTheme(getThemePref());
const which = new URLSearchParams(location.search).get("c");
const C = { tax: TaxIdCard, seat: SeatCard, admintax: AdminTaxIdCard, billing: BillingAdminCard, invoices: InvoicesCard, orders: OrdersCard, pending: PendingCenterCard, housepending: HousePendingCard, people: PeopleBoard }[which];
ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter><AppProvider><ConfirmProvider>
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>{C ? <C /> : <p>componente desconhecido</p>}</main>
    <ThemedToaster />
  </ConfirmProvider></AppProvider></BrowserRouter>
);

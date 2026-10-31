import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import PublicLayout from "@/components/layout/PublicLayout";
import Feed from "@/pages/Feed";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import HousePage from "@/pages/HousePage";
import Profile from "@/pages/Profile";
import Rituals from "@/pages/Rituals";
import RitualDetail from "@/pages/RitualDetail";
import Messages from "@/pages/Messages";
import RealMessages from "@/pages/RealMessages";
import Boost from "@/pages/Boost";
import Discover from "@/pages/Discover";
import Highlights from "@/pages/Highlights";
import Plans from "@/pages/Plans";
import Activity from "@/pages/Activity";
import Support from "@/pages/Support";
import HouseMembers from "@/pages/HouseMembers";
import Mensalidades from "@/pages/Mensalidades";
import MemberInvite from "@/pages/MemberInvite";
import Info from "@/pages/Info";
import PublicHousePage from "@/pages/PublicHouse";
import AdminShell from "@/pages/AdminShell";
import HouseHome from "@/pages/HouseHome";
import PaymentReturn from "@/pages/PaymentReturn";
import PaymentAccountReturn from "@/pages/PaymentAccountReturn";
import NotFound from "@/pages/NotFound";
import { useApp } from "@/contexts/AppContext";
import { ConfirmProvider } from "@/components/base/Confirm";

function Protected({ children }: { children: JSX.Element }) {
  const { currentUser, authReady } = useApp();
  const location = useLocation();
  if (!authReady) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-sm text-muted-foreground" role="status">
        Carregando…
      </div>
    );
  }
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

/** Conta real usa mensagens reais (com a assistente); o modo demonstração mantém as de exemplo. */
function MessagesRoute() {
  const { isRemoteAuth } = useApp();
  return isRemoteAuth ? <RealMessages /> : <Messages />;
}

/** Casa com conta real começa na página da casa; as demais, no feed. */
function Home() {
  const { currentUser, isRemoteAuth } = useApp();
  return isRemoteAuth && currentUser?.type === "commercial" ? <HouseHome /> : <Feed />;
}

export default function App() {
  return (
    <ConfirmProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<PublicLayout />}>
        <Route path="/sobre/:slug" element={<Info />} />
        <Route path="/c/:slug" element={<PublicHousePage />} />
      </Route>
      <Route
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/comunidade" element={<Feed />} />
        <Route path="/descobrir" element={<Discover />} />
        <Route path="/rituais" element={<Rituals />} />
        <Route path="/rituais/:id" element={<RitualDetail />} />
        <Route path="/casa/:id" element={<HousePage />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/mensagens" element={<MessagesRoute />} />
        <Route path="/mensagens/:id" element={<MessagesRoute />} />
        <Route path="/impulsionar" element={<Boost />} />
        <Route path="/destaques" element={<Highlights />} />
        <Route path="/planos" element={<Plans />} />
        <Route path="/atividade" element={<Activity />} />
        <Route path="/suporte" element={<Support />} />
        <Route path="/painel/membros" element={<HouseMembers />} />
        <Route path="/mensalidades" element={<Mensalidades />} />
        <Route path="/convite/:token" element={<MemberInvite />} />
        <Route path="/pagamento/retorno" element={<PaymentReturn />} />
        <Route path="/pagamento/conta" element={<PaymentAccountReturn />} />
        <Route path="/admin" element={<AdminShell />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </ConfirmProvider>
  );
}

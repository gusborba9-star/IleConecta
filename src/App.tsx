import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
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
import Info from "@/pages/Info";
import Admin from "@/pages/Admin";
import HouseHome from "@/pages/HouseHome";
import AdminUsers from "@/components/admin/AdminUsers";
import NotFound from "@/pages/NotFound";
import { useApp } from "@/contexts/AppContext";

function Protected({ children }: { children: JSX.Element }) {
  const { currentUser, authReady } = useApp();
  if (!authReady) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-sm text-muted-foreground" role="status">
        Carregando…
      </div>
    );
  }
  if (!currentUser) return <Navigate to="/login" replace />;
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
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
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
        <Route path="/sobre/:slug" element={<Info />} />
        <Route path="/admin" element={<><Admin /><div className="mt-4 pb-16 lg:pb-4"><AdminUsers /></div></>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

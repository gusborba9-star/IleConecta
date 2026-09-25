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
import Boost from "@/pages/Boost";
import Discover from "@/pages/Discover";
import NotFound from "@/pages/NotFound";
import { useApp } from "@/contexts/AppContext";

function Protected({ children }: { children: JSX.Element }) {
  const { currentUser } = useApp();
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
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
        <Route path="/" element={<Feed />} />
        <Route path="/descobrir" element={<Discover />} />
        <Route path="/rituais" element={<Rituals />} />
        <Route path="/rituais/:id" element={<RitualDetail />} />
        <Route path="/casa/:id" element={<HousePage />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/mensagens" element={<Messages />} />
        <Route path="/mensagens/:id" element={<Messages />} />
        <Route path="/impulsionar" element={<Boost />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

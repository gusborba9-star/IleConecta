import RouteTitle from "@/components/layout/RouteTitle";
import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import PublicLayout from "@/components/layout/PublicLayout";
import Feed from "@/pages/Feed";
import Login from "@/pages/Login";
import HouseHome from "@/pages/HouseHome";
import { useApp } from "@/contexts/AppContext";
import { ConfirmProvider } from "@/components/base/Confirm";
import TelaComErro from "@/components/layout/TelaComErro";

// Cada tela é baixada só quando a pessoa chega nela: o primeiro carregamento no celular fica bem menor.
// Entrada (login), feed e página inicial da casa ficam no pacote principal.
const Register = lazy(() => import("@/pages/Register"));
const HousePage = lazy(() => import("@/pages/HousePage"));
const Profile = lazy(() => import("@/pages/Profile"));
const Rituals = lazy(() => import("@/pages/Rituals"));
const RitualDetail = lazy(() => import("@/pages/RitualDetail"));
const Messages = lazy(() => import("@/pages/Messages"));
const RealMessages = lazy(() => import("@/pages/RealMessages"));
const Boost = lazy(() => import("@/pages/Boost"));
const Discover = lazy(() => import("@/pages/Discover"));
const Highlights = lazy(() => import("@/pages/Highlights"));
const Plans = lazy(() => import("@/pages/Plans"));
const Pedidos = lazy(() => import("@/pages/Pedidos"));
const Agenda = lazy(() => import("@/pages/Agenda"));
const Recebimentos = lazy(() => import("@/pages/Recebimentos"));
const Activity = lazy(() => import("@/pages/Activity"));
const Support = lazy(() => import("@/pages/Support"));
const MyCases = lazy(() => import("@/pages/MyCases"));
const ForgotPassword = lazy(() => import("@/pages/Recover").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("@/pages/Recover").then((m) => ({ default: m.ResetPassword })));
const Terms = lazy(() => import("@/pages/Terms"));
const AudioCredits = lazy(() => import("@/pages/AudioCredits"));
const Moderation = lazy(() => import("@/pages/Moderation"));
const HouseMembers = lazy(() => import("@/pages/HouseMembers"));
const Divulgacao = lazy(() => import("@/pages/Divulgacao"));
const Equipe = lazy(() => import("@/pages/Equipe"));
const EquipeConvite = lazy(() => import("@/pages/EquipeConvite"));
const Atendimento = lazy(() => import("@/pages/Atendimento"));
const Mensalidades = lazy(() => import("@/pages/Mensalidades"));
const Pessoas = lazy(() => import("@/pages/Pessoas"));
const MemberInvite = lazy(() => import("@/pages/MemberInvite"));
const Info = lazy(() => import("@/pages/Info"));
const PublicHousePage = lazy(() => import("@/pages/PublicHouse"));
const AdminShell = lazy(() => import("@/pages/AdminShell"));
const PaymentReturn = lazy(() => import("@/pages/PaymentReturn"));
const PaymentAccountReturn = lazy(() => import("@/pages/PaymentAccountReturn"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function TelaCarregando() {
  return (
    <div className="min-h-[50vh] grid place-items-center text-sm text-muted-foreground" role="status">
      Carregando…
    </div>
  );
}

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
    <TelaComErro>
    <Suspense fallback={<TelaCarregando />}>
    <RouteTitle />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/recuperar-senha" element={<ForgotPassword />} />
      <Route path="/redefinir-senha" element={<ResetPassword />} />
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
        <Route path="/crescer" element={<Navigate to="/impulsionar" replace />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/recebimentos" element={<Recebimentos />} />
        <Route path="/planos" element={<Plans />} />
        <Route path="/atividade" element={<Navigate to="/perfil?aba=atividade" replace />} />
        <Route path="/suporte" element={<Support />} />
        <Route path="/suporte/chamados" element={<MyCases />} />
        <Route path="/suporte/chamados/:id" element={<MyCases />} />
        <Route path="/termos" element={<Terms />} />
        <Route path="/creditos-de-audio" element={<AudioCredits />} />
        <Route path="/moderacao" element={<Moderation />} />
        <Route path="/painel/membros" element={<HouseMembers />} />
        <Route path="/divulgacao" element={<Divulgacao />} />
        <Route path="/equipe" element={<Equipe />} />
        <Route path="/equipe/convite/:token" element={<EquipeConvite />} />
        <Route path="/atendimento" element={<Atendimento />} />
        <Route path="/mensalidades" element={<Navigate to="/perfil?aba=mensalidades" replace />} />
        <Route path="/pessoas" element={<Pessoas />} />
        <Route path="/convite/:token" element={<MemberInvite />} />
        <Route path="/pagamento/retorno" element={<PaymentReturn />} />
        <Route path="/pagamento/conta" element={<PaymentAccountReturn />} />
        <Route path="/admin" element={<AdminShell />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
    </TelaComErro>
    </ConfirmProvider>
  );
}

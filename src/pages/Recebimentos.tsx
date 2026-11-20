import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import PaymentAccountCard from "@/components/payments/PaymentAccountCard";
import { fetchHouseTermsAccepted } from "@/lib/consents";
import { useOwnerPlan } from "@/lib/housePlan";

/** Onde a casa cadastra e acompanha a conta de recebimento (Stripe). Antes ficava no meio do Início. */
export default function Recebimentos() {
  const { currentUser, isRemoteAuth } = useApp();
  const houseId = currentUser?.type === "commercial" ? currentUser.id : undefined;
  const { plan } = useOwnerPlan(houseId);
  const [termsOk, setTermsOk] = useState(true);
  useEffect(() => {
    if (!isRemoteAuth || !houseId) return;
    let alive = true;
    void fetchHouseTermsAccepted(houseId).then((ok) => alive && setTermsOk(ok));
    return () => { alive = false; };
  }, [isRemoteAuth, houseId]);
  if (!houseId || !isRemoteAuth) return <Navigate to="/" replace />;
  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-5">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold-ink">Painel da casa</div>
        <h1 className="mt-1 break-words font-display text-2xl font-bold">Recebimentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">A conta onde cai o dinheiro dos serviços, rituais e mensalidades vendidos pela plataforma.</p>
      </Card>
      <PaymentAccountCard ownerId={houseId} termsOk={termsOk} required={plan === "gratis"} explainWhenOff />
    </div>
  );
}

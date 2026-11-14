/** Por que pagar pela plataforma: mostrado ao cliente antes de reservar ou contratar. */
const PLATFORM_BENEFITS = [
  "Pagamento seguro e registrado, com comprovante.",
  "Reembolso integral se você cancelar antes de a casa começar.",
  "Você é avisado quando a casa iniciar e quando terminar.",
  "Histórico do seu pedido e do que foi pago sempre à mão.",
  "Só quem comprou pela plataforma pode avaliar a casa.",
  "Algo não saiu como combinado? Relate o problema pelo Suporte e a nossa equipe analisa o caso.",
  "Combinar e pagar por fora não tem reembolso, comprovante nem suporte da plataforma.",
];

export default function PlatformBenefits() {
  return (
    <div className="rounded-xl border border-border p-3 text-sm pillow">
      <p className="font-medium">Vantagens de pagar pela plataforma</p>
      <ul className="mt-1 list-disc pl-5 space-y-0.5 text-muted-foreground">
        {PLATFORM_BENEFITS.map((b) => <li key={b}>{b}</li>)}
      </ul>
    </div>
  );
}

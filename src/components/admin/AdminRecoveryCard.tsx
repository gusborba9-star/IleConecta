import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input } from "@/components/base";
import { supabase } from "@/lib/supabase";

type Row = { id: string; created_at: string; status: string; lane: string; recommendation: string | null; round: number; contact_email: string; candidate_user_id: string | null; notify_at: string; best_score: number };
type Reason = { code: string; label: string; weight: number; strong: boolean; result: "confere" | "parecido" | "nao_confere" | "nao_respondeu" };
type Detail = {
  id: string; status: string; lane: string; recommendation: string | null; round: number; contact_email: string; claimed: Record<string, string>; answers: Record<string, unknown>;
  evaluation: { reasons?: Reason[]; best?: { ratio?: number; strong_hits?: number; strong_miss?: number } } | null; word_checked: boolean | null; ip: string | null; previous_requests: number;
  candidate_accounts: { user_id: string; type: string; name: string | null; house_name: string | null; current_email: string | null; linked_emails: string[] }[];
};
type Scoring = { weights: Record<string, number>; approve: { minStrongHits: number; minRatio: number }; second: { minStrongHits: number; minRatio: number }; minAnswered: number; [k: string]: unknown };

const REC: Record<string, string> = { aprovar: "Sugestão: aprovar", recusar: "Sugestão: recusar", segunda_rodada: "Sugestão: pedir mais informações", insuficiente: "Informação insuficiente" };
const RES: Record<string, string> = { confere: "Confere", parecido: "Parecido", nao_confere: "Não confere", nao_respondeu: "Não respondeu" };
const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só o dono decide. O sistema sugere (regras fixas, sem IA) e explica; a decisão é sempre humana. Ninguém vê nem define senha. */
export default function AdminRecoveryCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);
  const [account, setAccount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [scoring, setScoring] = useState<Scoring | null>(null);
  const [showCfg, setShowCfg] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("admin_recovery_list", { p_status: "pendente" });
    setRows((data as Row[] | null) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const view = async (id: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("admin_recovery_get", { p_id: id });
    if (error || !data) return void toast.error("Não foi possível abrir o pedido.");
    const d = data as Detail;
    setOpen(d); setNote("");
    setAccount(d.candidate_accounts[0]?.user_id ?? "");
  };

  const decide = async (decision: "aprovar" | "recusar" | "segunda_rodada") => {
    if (!supabase || !open || busy) return;
    if (decision === "aprovar" && !UUID.test(account.trim())) return void toast.error("Escolha ou informe a conta que será recuperada.");
    setBusy(true);
    const { error } = await supabase.rpc("admin_recovery_decide", { p_id: open.id, p_decision: decision, p_account: decision === "aprovar" ? account.trim() : null, p_note: note.trim() || null });
    setBusy(false);
    if (error) return void toast.error(error.message || "Não foi possível registrar a decisão.");
    toast.success(decision === "aprovar" ? "Aprovado. O link de confirmação sai depois de 24 horas, só para o e-mail novo." : "Decisão registrada. O aviso sai por e-mail dentro do prazo padrão.");
    setOpen(null); await load();
  };

  const openCfg = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("admin_recovery_scoring_get");
    if (error || !data) return void toast.error("Não foi possível carregar os pesos.");
    setScoring(data as Scoring); setShowCfg(true);
  };
  const saveCfg = async () => {
    if (!supabase || !scoring) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_recovery_scoring_set", { p_value: scoring });
    setBusy(false);
    if (error) return void toast.error("Não foi possível salvar.");
    toast.success("Pesos salvos. Valem para os próximos pedidos."); setShowCfg(false);
  };
  const num = (v: string, fb: number) => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : fb; };

  if (rows === null) return null;
  const semConta = rows.filter((r) => r.lane === "sem_conta"), normais = rows.filter((r) => r.lane !== "sem_conta");
  const Item = ({ r }: { r: Row }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
      <div className="min-w-0 text-sm">
        <div className="font-semibold break-all">{r.contact_email}</div>
        <div className="text-xs text-muted-foreground">{fmt(r.created_at)}{r.round === 2 ? " · segunda rodada" : ""}</div>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={r.recommendation === "aprovar" ? "forest" : "muted"}>{REC[r.recommendation ?? "insuficiente"]}</Badge>
        <Button size="sm" variant="outline" onClick={() => void view(r.id)}>Abrir</Button>
      </div>
    </li>
  );

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-bold text-lg">Recuperação de acesso</h2>
        <Button size="sm" variant="outline" onClick={() => void openCfg()}>Pesos e limites</Button>
      </div>
      <p className="text-xs text-muted-foreground">Pedidos de quem perdeu o acesso. O sistema compara as respostas com a conta e sugere; você decide. Nunca peça nem defina senha: quem é aprovado confirma o e-mail novo e cria a própria senha.</p>

      {showCfg && scoring && (
        <div className="rounded-xl border border-border p-3 space-y-3">
          <div className="text-sm font-semibold">Peso de cada prova (0 a 100)</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.keys(scoring.weights).map((k) => (
              <label key={k} className="text-xs">{k}<Input inputMode="decimal" value={String(scoring.weights[k])} onChange={(e) => setScoring({ ...scoring, weights: { ...scoring.weights, [k]: num(e.target.value, scoring.weights[k]) } })} /></label>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-xs">Provas fortes p/ aprovar<Input inputMode="numeric" value={String(scoring.approve.minStrongHits)} onChange={(e) => setScoring({ ...scoring, approve: { ...scoring.approve, minStrongHits: num(e.target.value, scoring.approve.minStrongHits) } })} /></label>
            <label className="text-xs">Aproveitamento p/ aprovar (0-1)<Input inputMode="decimal" value={String(scoring.approve.minRatio)} onChange={(e) => setScoring({ ...scoring, approve: { ...scoring.approve, minRatio: num(e.target.value, scoring.approve.minRatio) } })} /></label>
            <label className="text-xs">Aproveitamento p/ 2ª rodada (0-1)<Input inputMode="decimal" value={String(scoring.second.minRatio)} onChange={(e) => setScoring({ ...scoring, second: { ...scoring.second, minRatio: num(e.target.value, scoring.second.minRatio) } })} /></label>
            <label className="text-xs">Mínimo de respostas<Input inputMode="numeric" value={String(scoring.minAnswered)} onChange={(e) => setScoring({ ...scoring, minAnswered: num(e.target.value, scoring.minAnswered) })} /></label>
          </div>
          <div className="flex gap-2"><Button size="sm" onClick={() => void saveCfg()} disabled={busy}>Salvar</Button><Button size="sm" variant="outline" onClick={() => setShowCfg(false)}>Fechar</Button></div>
        </div>
      )}

      {open ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2"><div className="font-semibold break-all">{open.contact_email}</div><Button size="sm" variant="outline" onClick={() => setOpen(null)}>Voltar à fila</Button></div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone={open.recommendation === "aprovar" ? "forest" : "muted"}>{REC[open.recommendation ?? "insuficiente"]}</Badge>
            {open.lane === "sem_conta" && <Badge tone="muted">Nenhuma conta encontrada</Badge>}
            {open.round === 2 && <Badge tone="muted">Segunda rodada</Badge>}
            {open.previous_requests > 0 && <Badge tone="muted">{open.previous_requests} pedido(s) anterior(es) deste e-mail</Badge>}
            {open.word_checked === true && <Badge tone="muted">Palavra de segurança conferida</Badge>}
          </div>
          <div>
            <div className="text-sm font-semibold mb-1">Motivos do sistema</div>
            <ul className="space-y-1 text-sm">
              {(open.evaluation?.reasons ?? []).map((r) => (
                <li key={r.code} className="flex justify-between gap-2 border-b border-border/60 py-1"><span>{r.label}{r.strong ? " ★" : ""}</span><span className={r.result === "confere" ? "text-emerald-700 dark:text-emerald-400" : r.result === "nao_confere" ? "text-destructive" : "text-muted-foreground"}>{RES[r.result]}</span></li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">★ = prova forte. “Não respondeu” não conta contra a pessoa.</p>
          </div>
          <div className="text-sm space-y-0.5">
            <div className="font-semibold">O que a pessoa informou</div>
            <div>Tipo: {open.claimed.type} · Nome: {open.claimed.name || "—"} · Cidade: {open.claimed.city || "—"}</div>
            <div>E-mail antigo que lembra: {open.claimed.old_email || "—"}</div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold">Conta a recuperar</div>
            {open.candidate_accounts.map((c) => (
              <label key={c.user_id} className="flex items-start gap-2 rounded-xl border border-border p-2 text-sm">
                <input type="radio" name="rec-account" className="mt-1" checked={account === c.user_id} onChange={() => setAccount(c.user_id)} />
                <span className="min-w-0"><span className="font-semibold">{c.house_name || c.name || "Sem nome"}</span> ({c.type})<br /><span className="text-xs text-muted-foreground break-all">Atual: {c.current_email ?? "—"}{c.linked_emails.length > 1 ? ` · vinculados: ${c.linked_emails.join(", ")}` : ""}</span></span>
              </label>
            ))}
            {open.lane === "sem_conta" && <p className="text-xs text-muted-foreground">Nenhuma conta combinou. Se você identificar a conta por outro meio, informe o ID dela abaixo; caso contrário, recuse.</p>}
            <Input aria-label="ID da conta" placeholder="ID da conta (se não estiver na lista)" value={account} onChange={(e) => setAccount(e.target.value)} />
            <Input aria-label="Observação interna" placeholder="Observação interna (opcional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decide("aprovar")}>Aprovar e vincular e-mail novo</Button>
            {open.round < 2 && <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("segunda_rodada")}>Pedir mais informações</Button>}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("recusar")}>Recusar</Button>
          </div>
          <p className="text-xs text-muted-foreground">Ao aprovar: a pessoa é avisada no e-mail novo; depois de 24 horas ela recebe, só nele, o link de confirmação. O e-mail antigo recebe um aviso e todas as sessões da conta são encerradas na troca.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido aguardando decisão.</p>}
          {normais.length > 0 && <ul className="space-y-2">{normais.map((r) => <Item key={r.id} r={r} />)}</ul>}
          {semConta.length > 0 && (<><div className="text-sm font-semibold">Sem conta encontrada</div><ul className="space-y-2">{semConta.map((r) => <Item key={r.id} r={r} />)}</ul></>)}
        </div>
      )}
    </Card>
  );
}

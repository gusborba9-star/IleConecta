import test from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_LIMIT,
  MAX_USER_CHARS,
  USER_RATE,
  allowedDiscountPercent,
  buildSystemPrompt,
  canSell,
  checkGate,
  cleanReply,
  cleanUserText,
  featureEnabled,
  formatCents,
  monthStartISO,
  toChatMessages,
  hasGuaranteeTalk,
  stripGuaranteeTalk,
} from "../supabase/functions/assistant-chat/logic.js";

const assistantOn = {
  enabled: true,
  display_name: "Dandara",
  instructions: "Tom acolhedor.",
  business_hours: { seg: "9h-18h", dom: "  " },
  can_sell: true,
  can_discount: true,
  max_discount_percent: 15,
};
const house = { name: "Ilê Axé", category: "Candomblé Ketu" };
const base = { house, assistant: assistantOn, services: [], events: [] };

test("plano base não tem assistente; cota e limite por usuário bloqueiam", () => {
  const ok = { plan: "maximo", assistant: assistantOn, usedThisMonth: 0, usedByUserInWindow: 0 };
  assert.equal(checkGate(ok), null);
  assert.equal(checkGate({ ...ok, plan: "base" }), "plano_sem_assistente");
  assert.equal(checkGate({ ...ok, plan: "desconhecido" }), "plano_sem_assistente");
  assert.equal(checkGate({ ...ok, assistant: { ...assistantOn, enabled: false } }), "assistente_desativada");
  assert.equal(checkGate({ ...ok, assistant: null }), "assistente_desativada");
  assert.equal(checkGate({ ...ok, plan: "intermediario", usedThisMonth: 300 }), "cota_mensal");
  assert.equal(checkGate({ ...ok, plan: "intermediario", usedThisMonth: 299 }), null);
  assert.equal(checkGate({ ...ok, usedByUserInWindow: USER_RATE.maxReplies }), "muitas_mensagens");
});

test("desconto e venda só no plano máximo e dentro do limite da casa", () => {
  assert.equal(allowedDiscountPercent("maximo", assistantOn), 15);
  assert.equal(allowedDiscountPercent("intermediario", assistantOn), 0);
  assert.equal(allowedDiscountPercent("maximo", { ...assistantOn, can_discount: false }), 0);
  assert.equal(allowedDiscountPercent("maximo", { ...assistantOn, max_discount_percent: 250 }), 100);
  assert.equal(allowedDiscountPercent("maximo", { ...assistantOn, max_discount_percent: -5 }), 0);
  assert.equal(allowedDiscountPercent("maximo", { ...assistantOn, max_discount_percent: "abc" }), 0);
  assert.equal(canSell("maximo", assistantOn), true);
  assert.equal(canSell("intermediario", assistantOn), true);
  assert.equal(canSell("base", assistantOn), false);
  assert.equal(canSell("maximo", { ...assistantOn, can_sell: false }), false);
});

test("limpa a mensagem do cliente", () => {
  assert.equal(cleanUserText("  oi\u0000 tudo bem?  "), "oi tudo bem?");
  assert.equal(cleanUserText("   "), "");
  assert.equal(cleanUserText(42), "");
  assert.equal(cleanUserText("a".repeat(MAX_USER_CHARS + 50)).length, MAX_USER_CHARS);
  assert.equal(cleanReply("  olá  "), "olá");
  assert.equal(cleanReply(null), "");
});

test("prompt traz serviços reais com preço exato e as regras de segurança", () => {
  const p = buildSystemPrompt({
    ...base,
    plan: "maximo",
    services: [{ kind: "buzios", title: "Jogo de búzios", description: "Consulta online", price_cents: 12050 }],
    events: [{ title: "Ritual de prosperidade", price_cents: 29900, mode: "hibrido", starts_at: "2026-10-31T20:00:00Z" }],
    now: new Date("2026-10-25T12:00:00Z"),
  });
  assert.match(p, /Jogo de búzios/);
  assert.ok(p.includes(formatCents(12050)));
  assert.ok(p.includes(formatCents(29900)));
  assert.match(p, /2026-10-31/);
  assert.match(p, /segunda: 9h-18h/);
  assert.doesNotMatch(p, /domingo/);
  assert.match(p, /Nunca invente/);
  assert.match(p, /desconto de até 15%/);
  assert.match(p, /nunca por você/);
});

test("Profissional vende sem desconto; casa que desligou a venda só informa e passa para a casa", () => {
  const p = buildSystemPrompt({ ...base, plan: "intermediario" });
  assert.match(p, /NÃO pode oferecer nem negociar desconto/);
  const svc = [{ title: "Leitura", kind: "cartas", delivery: "transmissao", price_cents: 9000 }];
  const withSvc = buildSystemPrompt({ ...base, services: svc, plan: "intermediario" });
  assert.match(withSvc, /fechar a contratação/);
  const off = buildSystemPrompt({ ...base, services: svc, assistant: { ...assistantOn, can_sell: false }, plan: "intermediario" });
  assert.match(off, /não conduza a contratação/);
  assert.doesNotMatch(p, /desconto de até/);
  assert.match(p, /\(nenhum cadastrado\)/);
});

test("formata dinheiro em centavos sem erro de ponto flutuante", () => {
  assert.equal(formatCents(29900).replace(/\s/g, " "), "R$ 299,00");
  assert.equal(formatCents(5).replace(/\s/g, " "), "R$ 0,05");
});

test("histórico: limita, mantém ordem e separa assistente de cliente", () => {
  const history = Array.from({ length: 30 }, (_, i) => ({
    sender_id: i % 2 ? "dono" : "cliente",
    from_assistant: i % 2 === 1,
    text: `m${i}`,
  }));
  const chat = toChatMessages(history, "dono");
  assert.equal(chat.length, HISTORY_LIMIT);
  assert.equal(chat.at(-1).content, "m29");
  assert.equal(chat.at(-1).role, "assistant");
  assert.equal(chat[0].role, chat[0].content === "m10" ? "user" : "assistant");
  // A casa falando como pessoa/equipe entra como "assistant", marcada, para a assistente retomar o combinado.
  const h = toChatMessages([{ sender_id: "cliente", from_assistant: false, text: "quero" }, { sender_id: "dono", from_assistant: false, text: "temos sim" }, { sender_id: "dono", from_assistant: true, text: "ok" }], "dono");
  assert.deepEqual(h.map((m) => m.role), ["user", "assistant", "assistant"]);
  assert.equal(h[1].content, "[Atendimento da casa] temos sim");
  assert.equal(h[2].content, "ok");
  assert.equal(h[0].content, "quero");
});

test("cota mensal começa no dia 1 em UTC", () => {
  assert.equal(monthStartISO(new Date("2026-10-25T23:59:00Z")), "2026-10-01T00:00:00.000Z");
});

test("interruptor do painel: sem configuração liga; desligado bloqueia; beta só para casas listadas", () => {
  assert.equal(featureEnabled(undefined, "assistant", "a"), true);
  assert.equal(featureEnabled({}, "assistant", "a"), true);
  assert.equal(featureEnabled({ assistant: { state: "off" } }, "assistant", "a"), false);
  assert.equal(featureEnabled({ assistant: { state: "on" } }, "assistant", "a"), true);
  assert.equal(featureEnabled({ assistant: { state: "beta", beta_houses: ["a"] } }, "assistant", "a"), true);
  assert.equal(featureEnabled({ assistant: { state: "beta", beta_houses: ["a"] } }, "assistant", "b"), false);
  assert.equal(featureEnabled({ assistant: { state: "beta" } }, "assistant", "a"), false);
});

// --- Guias curtos por recurso: o prompt só carrega o que a casa realmente tem ---
const ritual = { id: "e", title: "Ritual de prosperidade", price_cents: 29900, mode: "distancia", starts_at: "2026-11-15T23:00:00-03:00", seats_left: 12 };
const servico = { title: "Leitura de cartas", kind: "cartas", delivery: "transmissao", price_cents: 9000 };

test("guias: casa sem nada cadastrado não carrega os guias de serviço, agenda, catálogo e trabalhos", () => {
  const p = buildSystemPrompt({ ...base, plan: "intermediario" });
  assert.doesNotMatch(p, /Serviços publicados/);
  assert.doesNotMatch(p, /Datas da "AGENDA DA CASA"/);
  assert.doesNotMatch(p, /CATÁLOGO INTERNO/);
  assert.doesNotMatch(p, /TRABALHOS QUE A CASA REALIZA/);
  assert.doesNotMatch(p, /Pagar pela plataforma é mais seguro/);
  assert.doesNotMatch(p, /a\) a pessoa disse que quer participar de uma data da agenda/);
  assert.match(p, /não há nenhum aberto agora/);
});

test("guias: o prompt de uma casa vazia é bem menor que o de uma casa completa", () => {
  const vazia = buildSystemPrompt({ ...base, plan: "intermediario" });
  const completa = buildSystemPrompt({
    ...base, plan: "maximo", payments: true, services: [servico], events: [ritual],
    agenda: ["Gira — sábado, 7/11, 20h"], catalog: [{ name: "Búzios", priceText: "R$ 200", description: "Presencial" }],
    house: { ...house, offerings: "Jogo de búzios." },
  });
  assert.ok(vazia.length < 5300, `prompt vazio com ${vazia.length} caracteres`);
  assert.ok(completa.length < 13000, `prompt completo com ${completa.length} caracteres`);
  assert.match(completa, /COMO VENDER:/);
  assert.match(completa, /briefing do que ela quer dizer/);
  assert.match(completa, /não pergunte de novo/);
  assert.match(completa, /Fale do propósito, nunca de resultado/);
  assert.match(completa, /Esse trabalho é feito exatamente para/);
  assert.match(completa, /ofereça-o pelo nome para entender o caso dela/);
  assert.match(completa, /não ofereça passar para a casa/);
  assert.ok(vazia.length < completa.length * 0.6);
});

test("guias: com agenda, o marcador lista o caso da data e o ritual não puxa a agenda sem ser perguntada", () => {
  const p = buildSystemPrompt({ ...base, events: [ritual], agenda: ["Gira — sábado, 7/11, 20h"] });
  assert.match(p, /a\) a pessoa disse que quer participar de uma data da agenda;/);
  assert.match(p, /b\) a pessoa quer contratar/);
  assert.match(p, /Se a pergunta for só sobre ritual, fale só dos rituais e não acrescente datas da agenda/);
  assert.match(p, /Se a pergunta for só sobre uma data da agenda, não traga ritual/);
  const sem = buildSystemPrompt({ ...base, events: [ritual] });
  assert.doesNotMatch(sem, /não acrescente datas da agenda/);
});

test("guias: só diz que a pessoa escolhe a modalidade quando o serviço é híbrido; nunca 'sozinha ou sozinho'", () => {
  const p = buildSystemPrompt({ ...base, services: [servico] });
  assert.match(p, /Só diga que a pessoa escolhe a modalidade quando o serviço estiver listado como/);
  assert.match(p, /nos demais cite apenas a modalidade listada/);
  assert.match(p, /nunca escreva pares como "sozinha ou sozinho"/);
  assert.doesNotMatch(p, /Quando um serviço for híbrido \(presencial ou à distância\), diga que a pessoa escolhe/);
});

test("guias: itens do catálogo e dos trabalhos só aparecem nas regras quando existem", () => {
  const sem = buildSystemPrompt({ ...base, services: [servico] });
  assert.doesNotMatch(sem, /valor que você pode informar/);
  const com = buildSystemPrompt({ ...base, services: [servico], catalog: [{ name: "Búzios", priceText: "R$ 200", description: "" }], house: { ...house, offerings: "Jogo de búzios." } });
  assert.match(com, /Os itens do "CATÁLOGO INTERNO DA CASA" só podem ter o valor informado/);
  assert.match(com, /Os trabalhos descritos em "TRABALHOS QUE A CASA REALIZA" existem/);
});

test("garantia: detecta 'não garanto/não posso afirmar' e não pega 'garantir a vaga' nem reembolso", () => {
  for (const t of [
    "Não consigo afirmar que o trabalho vai abrir portas, porque não há como garantir resultados.",
    "Não posso prometer resultados.", "Eu não garanto resultado nenhum.", "Isso não depende de mim.", "Não há garantia de resultado.",
    "mas não consigo dizer que resultado vai trazer",
    "Ele não é uma promessa de resultado, mas um cuidado voltado para a busca que você descreveu.",
    "É um trabalho sem garantia de nada.", "O resultado depende de vários fatores.", "Não existe certeza de que vai funcionar.",
  ]) assert.equal(hasGuaranteeTalk(t), true, t);
  for (const t of [
    "Para garantir a vaga, use o botão Reservar vaga.", "Se você cancelar antes, o valor volta integralmente.",
    "Ele é feito para abrir caminhos e oportunidades.", "Não consigo garantir a vaga sem pagamento.", "Você garante a sua vaga pelo botão.", "Sem pagamento não há reserva.", "É um trabalho feito com sigilo e cuidado.", "", null,
  ]) assert.equal(hasGuaranteeTalk(t), false, String(t));
});

test("garantia: o corte tira só as frases de garantia e nunca deixa a resposta vazia", () => {
  const out = stripGuaranteeTalk("O trabalho é feito para abrir caminhos. Não posso prometer resultados. Se quiser, é só dizer sim.");
  assert.equal(out, "O trabalho é feito para abrir caminhos. Se quiser, é só dizer sim.");
  const only = "Não posso prometer resultados.";
  assert.equal(stripGuaranteeTalk(only), only);
  assert.equal(stripGuaranteeTalk("Tudo certo por aqui."), "Tudo certo por aqui.");
});

test("conversa passada para a casa: a assistente continua atendendo, fala do assunto e não repete o aviso", () => {
  const sem = buildSystemPrompt({ ...base, plan: "maximo" });
  assert.ok(!sem.includes("A CASA JÁ FOI AVISADA"));
  const com = buildSystemPrompt({ ...base, plan: "maximo", pending: { reason: "Quer saber de limpeza espiritual" } });
  assert.match(com, /A CASA JÁ FOI AVISADA sobre: Quer saber de limpeza espiritual e responde por aqui\. Você continua atendendo/);
  assert.match(com, /converse também sobre esse assunto/);
  assert.match(com, /Se a pessoa falar de outro assunto, atenda normalmente/);
  assert.match(com, /não use \[\[CASA\]\] de novo para o mesmo assunto/);
  assert.match(buildSystemPrompt({ ...base, plan: "maximo", pending: { reason: "" } }), /A CASA JÁ FOI AVISADA e responde por aqui/);
});

test("primeira camada: a assistente passa só quando não há mais o que fazer; assunto delicado é conversado, não repassado", () => {
  const p = buildSystemPrompt({ ...base, plan: "maximo" });
  assert.match(p, /primeira camada de atendimento e venda: passe só quando não houver mais o que fazer/);
  assert.match(p, /Assunto delicado \(luto, crise emocional, saúde\)[^\n]*converse a partir do que a casa realiza/);
  assert.match(p, /reclamação, risco de vida ou pedido que você realmente não pode resolver/);
  assert.ok(!/assunto delicado, reclamação ou pedido/.test(p), "assunto delicado não é mais caso automático de repasse");
  assert.match(p, /pergunte se pode ajudar em mais alguma coisa enquanto isso/);
  assert.match(p, /você não está só/);
  assert.match(p, /CVV/);
  assert.match(p, /Assunto delicado[^\n]*deixe a casa como opção/);
  assert.ok(!/Não ofereça passar para a casa/.test(p), "no luto a casa é opção, não proibição");
});

test("mudança de assunto: a última mensagem manda e preço/vaga/horário saem só da lista atual", () => {
  const p = buildSystemPrompt({ ...base, plan: "maximo" });
  assert.match(p, /A última mensagem define o assunto: se mudou, responda só sobre o novo/);
  assert.match(p, /Preço, vaga e horário saem só da lista atual, nunca de mensagens antigas/);
});

test("retomada: as mensagens da casa entram marcadas e o histórico é maior (20)", () => {
  assert.equal(HISTORY_LIMIT, 20);
  const chat = toChatMessages([
    { sender_id: "cliente", from_assistant: false, text: "quero o trabalho de amor" },
    { sender_id: "dono", from_assistant: false, text: "Fica R$ 300, combinado para sexta" },
    { sender_id: "cliente", from_assistant: false, text: "ok" },
  ], "dono");
  assert.equal(chat[1].content, "[Atendimento da casa] Fica R$ 300, combinado para sexta");
  assert.equal(chat[1].role, "assistant");
});

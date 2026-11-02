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
  const history = Array.from({ length: 20 }, (_, i) => ({
    sender_id: i % 2 ? "dono" : "cliente",
    from_assistant: i % 2 === 1,
    text: `m${i}`,
  }));
  const chat = toChatMessages(history, "dono");
  assert.equal(chat.length, HISTORY_LIMIT);
  assert.equal(chat.at(-1).content, "m19");
  assert.equal(chat.at(-1).role, "assistant");
  assert.equal(chat[0].role, chat[0].content === "m8" ? "user" : "assistant");
  // O dono falando como pessoa (não assistente) é tratado como cliente no histórico.
  assert.equal(toChatMessages([{ sender_id: "dono", from_assistant: false, text: "oi" }], "dono")[0].role, "user");
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
  assert.ok(completa.length < 11600, `prompt completo com ${completa.length} caracteres`);
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

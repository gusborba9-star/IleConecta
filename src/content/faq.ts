// Perguntas frequentes da página Suporte: uma lista para quem procura casas e outra para a casa.
// Taxas, planos e tarifas ficam nos Termos e nas telas de Planos; aqui só o que ajuda a usar a plataforma no dia a dia.
export interface FaqItem { q: string; a: string }

export const FAQ_CLIENT: FaqItem[] = [
  { q: "Como reservo um ritual ou contrato um serviço?", a: "Abra a página da casa e escolha a aba Rituais ou Serviços. Toque em Reservar ou Contratar e siga até o pagamento; a confirmação chega por aqui, nas notificações." },
  { q: "Como vou saber que o ritual começou?", a: "Quando a casa inicia e quando conclui, você recebe um aviso. Vale para quem reservou ou contratou, inclusive trabalhos à distância e em sigilo." },
  { q: "Como falo com a casa?", a: "Pelo chat, em Mensagens. A assistente da casa responde na hora sobre serviços, valores e vagas; se a pergunta for além, ela chama a casa e a resposta vem na mesma conversa." },
  { q: "A assistente pode errar?", a: "Ela usa só o que a casa cadastrou e avisa quando precisa confirmar algo. Em caso de dúvida, peça para falar com a casa." },
  { q: "O que aparece no meu Início?", a: "O que as casas que você segue ou com as quais tem vínculo publicam, e os destaques da rede. Toque em Perto de mim para ver as casas da sua cidade." },
  { q: "Preciso cancelar ou tive um problema. O que faço?", a: "Fale primeiro com a casa pelo chat. Se não resolver, abra um chamado aqui em Suporte e a equipe acompanha com você." },
];

export const FAQ_HOUSE: FaqItem[] = [
  { q: "Como inicio e concluo um ritual ou trabalho?", a: "Na hora, toque em Iniciar; ao terminar, em Concluir. Cada comando avisa quem reservou, contratou ou agendou. Não precisa preencher nada: já está configurado." },
  { q: "Quando assumo o chat e como devolvo para a assistente?", a: "Toque em Assumir na barra do alto do chat: a conversa passa a ser sua e a assistente espera. Para voltar, toque em Devolver à assistente." },
  { q: "O que a assistente sabe e como a melhoro?", a: "Ela usa seus serviços, rituais, valores, horários e as regras que você configura em Assistente. Quanto mais completo o cadastro, menos perguntas ela passa para você." },
  { q: "Como anuncio uma gira ou um aviso?", a: "Na Comunidade, toque em Gira, Aviso ou Foto. Uma gira pode levar o ritual anexado, com o botão Reservar vaga para o cliente." },
  { q: "Quem vê o que eu publico?", a: "Quem segue a casa ou tem vínculo com ela (reserva, serviço, membro). Para chegar a mais gente, use Crescer: destaque ou impulsionamento." },
  { q: "Onde acompanho pedidos, reservas e recebimentos?", a: "No Início, a Central de pendências mostra o que espera por você. Pedidos e Recebimentos ficam nas ferramentas; as regras de taxas e prazos estão nos Termos." },
];

// Base de conhecimento da assistente Conecta (suporte da plataforma): ela pode explicar taxas e planos; a página Suporte não os mostra.
export const FAQ: FaqItem[] = [
  { q: "Como mudo o plano da minha casa?", a: "Veja os planos em Planos. Por enquanto a troca de plano é feita com a equipe da plataforma." },
  { q: "Quando a casa recebe o valor de um evento?", a: "O pagamento do cliente vai direto para a conta de pagamento da casa, sem retenção pela plataforma. A tarifa do Stripe é cobrada da casa." },
  { q: "Qual é a taxa da plataforma?", a: "15% sobre vagas de rituais e 4% sobre serviços contratados pela plataforma. Atendimentos combinados direto com a casa não têm taxa." },
  { q: "A assistente virtual pode errar?", a: "Ela usa apenas os serviços, valores e horários cadastrados pela casa e avisa quando precisa confirmar algo. Em caso de dúvida, fale direto com a casa." },
];

// Roteiros "do objetivo ao caminho" para a assistente Conecta orientar passo a passo (nomes iguais aos das telas).
export const ROTEIROS: FaqItem[] = [
  { q: "Quero achar uma casa para o que eu preciso (amor, proteção, prosperidade…)", a: "Casas > toque no que você procura (ex.: Amor) ou digite na busca. Para ver só a sua cidade, toque em Perto de mim. Abra a casa, veja Rituais e Serviços e toque em Mensagem para conversar." },
  { q: "Quero seguir uma casa para ver o que ela publica", a: "Abra a página da casa e toque em Seguir. As publicações dela passam a aparecer no seu Início; quem reservou ou contratou também passa a ver o que a casa publica." },
  { q: "Quero reservar um ritual", a: "Casas > abra a casa > aba Rituais > Reservar > pagar. Depois, acompanhe em Perfil > Minha atividade; você é avisado quando a casa iniciar e concluir." },
  { q: "Quero pedir reembolso ou cancelar", a: "Perfil > Minha atividade > escolha a reserva ou o pedido. Se não resolver com a casa, abra um chamado em Suporte. As regras estão em Termos e normas." },
  { q: "Sou casa e quero publicar uma gira", a: "Comunidade > toque em Gira > escreva > (opcional) anexe o ritual > Publicar. Para chegar a mais gente, use Crescer (impulsionar ou destaque)." },
  { q: "Sou casa e quero que a assistente atenda melhor", a: "Perfil > Assistente: cadastre serviços, rituais, valores e horários. Em Mensagens, use Assumir quando quiser responder e Devolver à assistente para ela voltar." },
  { q: "Sou casa e quero receber pagamentos", a: "Recebimentos > cadastre a conta de recebimento. É por ele que os pagamentos de rituais e serviços chegam à casa." },
];

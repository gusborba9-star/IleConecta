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

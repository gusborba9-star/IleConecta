// Fonte única do que o app EXPÕE às telas. Com banco real configurado (remote = true) nada de demonstração passa:
// usuários, publicações, stories, rituais, conversas e compras de exemplo ficam de fora, mesmo que existam no
// localStorage de versões antigas. Sem banco (remote = false), o modo demonstração segue como era. Testado em tests/data-source.test.mjs.

/** Une dois conjuntos de usuários por id; o segundo prevalece. */
function byId(...lists) {
  const map = new Map();
  for (const list of lists) for (const u of list) map.set(u.id, u);
  return [...map.values()];
}

export function exposeState({ remote, demo, real }) {
  if (remote) {
    return {
      users: byId(real.users),
      posts: [...real.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      stories: [],
      rituals: [],
      conversations: [],
      purchases: [],
    };
  }
  const realIds = new Set(real.users.map((u) => u.id));
  return {
    users: [...demo.users.filter((u) => !realIds.has(u.id)), ...byId(real.users)],
    posts: [...real.posts, ...demo.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    stories: demo.stories,
    rituals: demo.rituals,
    conversations: demo.conversations,
    purchases: demo.purchases,
  };
}

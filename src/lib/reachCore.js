// Alcance orgânico (decisão do dono, 21/11/2026): o conteúdo de uma casa aparece no Início/Comunidade só para quem a segue ou tem vínculo com ela;
// para todos, só o que está impulsionado ou de casa em destaque. A busca (Casas, Rituais) continua aberta: é descoberta feita pela própria pessoa.
export function reachSets({ follows = [], bonds = [], highlightOwners = [], boostedItemIds = [] } = {}) {
  return { mine: new Set([...follows, ...bonds]), highlight: new Set(highlightOwners), boosted: new Set(boostedItemIds) };
}
/** viewerId: quem olha. ownerId: dono da casa autora. itemId: id da publicação/ritual (para impulsionamento). */
export function canSee({ viewerId, ownerId, itemId }, sets) {
  if (!ownerId) return false;
  if (viewerId && ownerId === viewerId) return true;
  return sets.mine.has(ownerId) || sets.highlight.has(ownerId) || (itemId != null && sets.boosted.has(itemId));
}

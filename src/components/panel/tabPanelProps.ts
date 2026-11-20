/** Atributos do painel de uma aba do `TabBar` (liga o painel à aba e esconde os outros). */
export const tabPanelProps = (idBase: string, id: string, value: string) => ({
  role: "tabpanel" as const,
  id: `${idBase}-painel-${id}`,
  "aria-labelledby": `${idBase}-tab-${id}`,
  hidden: id !== value,
  tabIndex: 0,
});

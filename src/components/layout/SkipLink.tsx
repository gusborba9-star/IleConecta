/** "Ir para o conteúdo": primeiro item da tabulação, só aparece quando recebe o foco. */
export default function SkipLink() {
  return (
    <a
      href="#conteudo"
      onClick={(e) => {
        e.preventDefault();
        const alvo = document.getElementById("conteudo");
        alvo?.focus();
        alvo?.scrollIntoView?.({ block: "start" });
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
    >
      Ir para o conteúdo
    </a>
  );
}

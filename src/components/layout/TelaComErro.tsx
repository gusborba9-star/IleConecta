import { Component, type ReactNode } from "react";

/** Se uma tela não abre (internet caiu no meio do carregamento, publicação nova no ar, erro inesperado), mostra um aviso com o botão de tentar de novo
 *  em vez de deixar a tela em branco. */
export default class TelaComErro extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() {
    return { erro: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Tela não abriu:", error);
  }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="min-h-[60vh] grid place-items-center px-6 text-center" role="alert">
        <div className="max-w-sm space-y-3">
          <p className="font-semibold">Não foi possível abrir esta tela.</p>
          <p className="text-sm text-muted-foreground">Confira a sua internet e tente de novo. Se o problema continuar, o aplicativo pode ter sido atualizado: recarregar resolve.</p>
          <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }
}

export const MAX_POR_ABERTURA: number;
export function textoDoErro(err: unknown): string;
export function deveIgnorar(texto: unknown): boolean;
export function limpar(texto: unknown, origem?: string): string;
export function criarRelator(o: { send: (route: string, message: string) => unknown; origem?: string }): (err: unknown, route?: string) => boolean;

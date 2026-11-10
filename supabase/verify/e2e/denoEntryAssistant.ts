// Ponto de entrada do harness da assistente: executa o index.ts REAL de assistant-chat no Deno.
// Adaptações de ambiente: chamadas a https://openrouter.ai vão para o modelo simulado local; porta fixa.
const real = globalThis.fetch.bind(globalThis);
const FAKE = Deno.env.get("FAKE_LLM_URL")!;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://openrouter.ai")) return real(url.replace("https://openrouter.ai", FAKE), init);
  return real(input as never, init);
}) as typeof fetch;
const serve = Deno.serve.bind(Deno) as (o: unknown, h: unknown) => unknown;
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Deno as any).serve = (handler: unknown) => serve({ port: Number(Deno.env.get("PORT")), hostname: "127.0.0.1", onListen: () => console.log("READY") }, handler);
await import(Deno.env.get("INDEX_URL")!);

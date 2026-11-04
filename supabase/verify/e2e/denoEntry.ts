// Ponto de entrada do harness: executa o index.ts REAL da Edge Function no Deno.
// Só duas adaptações de ambiente: (1) as chamadas a https://api.stripe.com vão para a API simulada local; (2) porta fixa.
const real = globalThis.fetch.bind(globalThis);
const FAKE = Deno.env.get("FAKE_STRIPE_URL")!;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://api.stripe.com")) return real(url.replace("https://api.stripe.com", FAKE), init);
  return real(input as never, init);
}) as typeof fetch;
const serve = Deno.serve.bind(Deno) as (o: unknown, h: unknown) => unknown;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (handler: unknown) => serve({ port: Number(Deno.env.get("PORT")), hostname: "127.0.0.1", onListen: () => console.log("READY") }, handler);
await import(Deno.env.get("INDEX_URL")!);

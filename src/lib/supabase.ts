import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true quando as variaveis de ambiente do Supabase estao configuradas. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Cliente Supabase do navegador (somente chave publica/anon; a seguranca vem das politicas RLS).
 * Fica null enquanto as variaveis nao existem, para o app continuar funcionando em modo demo.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;

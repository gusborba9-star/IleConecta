import { supabase } from "@/lib/supabase";

/** Registro de acesso (Marco Civil, art. 15): avisa o servidor de que a conta entrou (ao abrir o app já conectado ou ao entrar).
 *  O servidor lê o IP dos próprios cabeçalhos; aqui não se envia dado nenhum, e ele limita a um registro por conta e IP a cada 30 minutos.
 *  Falha em silêncio: não pode atrapalhar o uso. */
export async function registerAccess(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc("register_access");
  } catch {
    /* ignora */
  }
}

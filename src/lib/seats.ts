import { supabase } from "@/lib/supabase";
import { readSeatStatus, type SeatStatus } from "@/lib/seatsCore";

export async function fetchSeatStatus(): Promise<SeatStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_seat_status");
  return error ? null : readSeatStatus(data);
}

const known = (m: string) => (m.length < 260 && /[a-zà-ú]/i.test(m) ? m : "");

export async function scheduleSeatRelease(keep: number): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("my_seat_release_schedule", { p_keep: keep });
  return error ? known(error.message) || "Não foi possível agendar a redução." : null;
}

export async function undoSeatRelease(): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("my_seat_release_undo");
  return error ? known(error.message) || "Não foi possível desfazer a redução." : null;
}

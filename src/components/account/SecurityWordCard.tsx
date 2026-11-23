import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input, Label } from "@/components/base";
import { supabase } from "@/lib/supabase";

const DISMISS_KEY = "ic_secword_dismissed";
const safeGet = () => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };
const safeSet = () => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* sem armazenamento: o aviso volta, sem prejuízo */ } };

/**
 * Palavra de segurança: ajuda a provar que a conta é sua se um dia você perder o acesso.
 * Guardada só como código irreversível; nem nós conseguimos ler. Nunca é a senha.
 * `nudge`: aviso único (some se a pessoa já tem a palavra ou escolhe "Agora não").
 */
export default function SecurityWordCard({ nudge = false }: { nudge?: boolean }) {
  const [has, setHas] = useState<boolean | null>(null);
  const [word, setWord] = useState("");
  const [word2, setWord2] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => (nudge ? safeGet() : false));

  useEffect(() => {
    if (!supabase || hidden) return;
    void supabase.rpc("has_security_word").then(({ data, error }) => setHas(error ? null : Boolean(data)));
  }, [hidden]);

  const save = async () => {
    if (!supabase || busy) return;
    if (word.trim().length < 4) return void toast.error("Use pelo menos 4 caracteres.");
    if (word !== word2) return void toast.error("As duas palavras não são iguais.");
    setBusy(true);
    const { error } = await supabase.rpc("set_security_word", { p_word: word });
    setBusy(false);
    if (error) return void toast.error("Não foi possível salvar. Use de 4 a 60 caracteres.");
    setWord(""); setWord2(""); setHas(true); setEditing(false);
    toast.success("Palavra de segurança salva.");
  };

  if (!supabase || hidden || has === null) return null;
  if (nudge && has) return null;

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Palavra de segurança</h2>
      {has && !editing ? (
        <>
          <p className="text-sm text-muted-foreground">Você já cadastrou a sua. Ela só é usada se um dia você perder o acesso à conta.</p>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Trocar a palavra</Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Escolha uma palavra ou frase que só você saiba. Se um dia perder o acesso à conta, ela ajuda a provar que a conta é sua. Não é a sua senha, e nós não conseguimos ler o que você escreve.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="sw-1">Palavra ou frase</Label><Input id="sw-1" autoComplete="off" maxLength={60} value={word} onChange={(e) => setWord(e.target.value)} /></div>
            <div><Label htmlFor="sw-2">Repita</Label><Input id="sw-2" autoComplete="off" maxLength={60} value={word2} onChange={(e) => setWord2(e.target.value)} /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
            {nudge && <Button size="sm" variant="outline" onClick={() => { safeSet(); setHidden(true); }}>Agora não</Button>}
            {!nudge && editing && <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>}
          </div>
        </>
      )}
    </Card>
  );
}

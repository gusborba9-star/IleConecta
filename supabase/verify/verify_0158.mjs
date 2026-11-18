// Verificação LOCAL da 0158 (gatilho do estado do perfil com permissão) e AUDITORIA permanente de permissões de função.
// Uso: node supabase/verify/verify_0158.mjs  (bash /tmp/pgup.sh antes). IMPORTANTE: aqui NÃO se libera "execute em todas as funções": é o que escondia o defeito.
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const U = "a0158000-0000-0000-0000-000000000001";
const AUDIT_GATILHO = `
    with fn as (select p.oid, p.proname, p.prosecdef, p.prosrc, p.prorettype = 'trigger'::regtype as is_trigger from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'),
         locked as (select proname from fn where not has_function_privilege('authenticated', oid, 'execute'))
    select caller.proname as chamador, l.proname as chamada from fn caller join locked l on caller.prosrc ~ ('(^|[^a-z0-9_])' || l.proname || '\\s*\\(')
     where caller.is_trigger and not caller.prosecdef and caller.proname <> l.proname`;
const mig = readFileSync(new URL("../migrations/0158_perfil_estado_gatilho_com_permissao.sql", import.meta.url), "utf8");

// ---- 1) reproduz o defeito com as permissões reais (migrations até a 0157, sem a 0158)
{
  const name = "vf0158a";
  const { c: su } = await freshDb(name, { with64: true, max: 115 });
  await su.query(`grant usage on schema public, auth to authenticated; grant select, insert, update on public.profiles to authenticated;`);
  await su.query("insert into auth.users(id,email) values ($1,'u@x.com')", [U]);
  await su.query("insert into profiles(id,account_type,display_name,city,state) values ($1,'cliente','Pessoa','Porto Alegre','RS') on conflict (id) do update set state='RS'", [U]);
  const asUser = async (sql, p) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [U]); await c.query("set role authenticated"); return await c.query(sql, p); } finally { await c.end(); } };
  const err = (pr) => pr.then(() => null, (x) => x.message);
  const e1 = await err(asUser("update profiles set state='Rio Grande do Sul', city='Porto Alegre' where id=$1", [U]));
  ok("REPRODUZ o defeito antes da 0158: salvar o estado falha com 'permission denied'", /permission denied for function br_uf_from_text/.test(e1 ?? ""), e1 ?? "sem erro");
  const e2 = await err(asUser("update profiles set avatar_url='https://x/y.jpg', state=state where id=$1", [U]));
  ok("antes da 0158 até mandar o mesmo estado falha (foto não salva)", e2 !== null);
  const antes = (await su.query(AUDIT_GATILHO)).rows;
  ok("a AUDITORIA enxerga o defeito antes da 0158 (controle)", antes.some((r) => r.chamador === "profiles_state_norm" && r.chamada === "br_uf_from_text"), JSON.stringify(antes));
  await su.query(mig); await su.query(mig);
  ok("0158 aplica e reaplica sem erro", true);
  const e3 = await err(asUser("update profiles set state='Rio Grande do Sul', city='Porto Alegre', avatar_url='https://x/y.jpg' where id=$1", [U]));
  const row = (await su.query("select state, avatar_url from profiles where id=$1", [U])).rows[0];
  ok("depois da 0158: salva, normaliza para a sigla e grava a foto", e3 === null && row.state === "RS" && row.avatar_url === "https://x/y.jpg", e3 ?? JSON.stringify(row));
  for (const [txt, uf] of [["são paulo", "SP"], ["Rio Grande do Norte", "RN"], ["ba", "BA"], ["  Bahia ", "BA"]]) {
    await asUser("update profiles set state=$2 where id=$1", [U, txt]);
    ok(`estado "${txt.trim()}" vira ${uf}`, (await su.query("select state from profiles where id=$1", [U])).rows[0].state === uf);
  }
  const acl = (await su.query("select has_function_privilege('authenticated','public.br_uf_from_text(text)','execute') a, has_function_privilege('authenticated','public.profiles_state_norm()','execute') b")).rows[0];
  ok("a função auxiliar e o gatilho continuam fechados para quem está logado", acl.a === false && acl.b === false);
  const e4 = await err(asUser("select public.br_uf_from_text('RS')"));
  ok("quem está logado não chama a função auxiliar direto", e4 !== null);
  await su.end();
}

// ---- 2) AUDITORIA: com TODAS as migrations, nenhum gatilho/função comum pode depender de função ou tabela que quem está logado não alcança
{
  const name = "vf0158b";
  const { c: su, failed } = await freshDb(name, { with64: true, max: 9999 });
  console.log(`(informativo: ${failed.length} migrations não aplicaram neste banco de teste simplificado)`);
  const gatilhoChamaFuncaoFechada = (await su.query(AUDIT_GATILHO)).rows;
  ok("nenhum GATILHO comum chama função fechada para quem está logado", gatilhoChamaFuncaoFechada.length === 0, JSON.stringify(gatilhoChamaFuncaoFechada));
  const comumQueQuemLogadoChama = (await su.query(`
    with fn as (select p.oid, p.proname, p.prosecdef, p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.prorettype <> 'trigger'::regtype),
         locked as (select proname from fn where not has_function_privilege('authenticated', oid, 'execute'))
    select caller.proname as chamador, l.proname as chamada from fn caller join locked l on caller.prosrc ~ ('(^|[^a-z0-9_])' || l.proname || '\\s*\\(')
     where not caller.prosecdef and caller.proname <> l.proname and has_function_privilege('authenticated', caller.oid, 'execute')`)).rows;
  ok("nenhuma função comum liberada a quem está logado chama função fechada", comumQueQuemLogadoChama.length === 0, JSON.stringify(comumQueQuemLogadoChama));
  const policiaChamaFechada = (await su.query(`
    select pol.tablename, pol.policyname, p.proname from pg_policies pol join pg_proc p on p.pronamespace='public'::regnamespace and not has_function_privilege('authenticated', p.oid, 'execute')
     and (coalesce(pol.qual,'') || ' ' || coalesce(pol.with_check,'')) ~ ('(^|[^a-z0-9_.])(public\\.)?' || p.proname || '\\s*\\(')
     where p.prosecdef = false or true`)).rows;
  ok("nenhuma política de acesso usa função fechada para quem está logado", policiaChamaFechada.length === 0, JSON.stringify(policiaChamaFechada.slice(0, 5)));
  const gatilhoTabela = (await su.query(`
    select distinct p.proname as gatilho, c.relname as tabela from pg_proc p join pg_trigger t on t.tgfoid = p.oid and not t.tgisinternal
      join pg_class c on c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and p.prosrc ~* ('(public\\.|from |into |update |join )' || c.relname || '([^a-z0-9_]|$)')
     where p.pronamespace='public'::regnamespace and not p.prosecdef
       and not (has_table_privilege('authenticated', c.oid, 'select') and has_table_privilege('authenticated', c.oid, 'insert') and has_table_privilege('authenticated', c.oid, 'update'))`)).rows;
  console.log(`(informativo: gatilhos comuns citando tabela sem permissão total: ${gatilhoTabela.length})`);
  await su.end();
}
console.log(`\n${total - bad}/${total} verificações ok`);
process.exit(bad ? 1 : 0);

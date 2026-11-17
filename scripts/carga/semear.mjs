// Popula o banco LOCAL "carga" com o volume de teste: 200 casas, 1.200 clientes e 4.000 membros (com conta). Uso: node scripts/carga/semear.mjs
import { connect } from "../../supabase/verify/pgbase.mjs";
const c = await connect("carga");
const t0 = Date.now(); const lap = (n) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${n}`);
const run = async (n, sql) => { await c.query(sql); lap(n); };
await c.query("set session_replication_role = replica"); // semeadura em massa: sem gatilhos nem checagem de chave (os dados são montados consistentes)
await c.query("truncate auth.users cascade");
await run("usuários (200 donos de casa + 1.200 clientes + 4.000 membros)", `
create temp table su as select n, gen_random_uuid() id, case when n<=200 then 'casa' when n<=1400 then 'cliente' else 'membro' end kind from generate_series(1,5400) n;
insert into auth.users(id,email) select id, 'u'||n||'@x.com' from su;
insert into profiles(id,account_type,display_name,city,state,country,created_at,last_seen_at)
 select id, case when kind='casa' then 'casa'::account_type else 'cliente'::account_type end, 'Pessoa '||n,
  (array['Salvador','São Paulo','Rio de Janeiro','Recife','Belo Horizonte','Fortaleza','Curitiba','Porto Alegre','Belém','Goiânia'])[1+n%10],
  (array['BA','SP','RJ','PE','MG','CE','PR','RS','PA','GO'])[1+n%10], 'BR', now()-random()*interval '120 days', now()-random()*interval '2 days' from su;`);
await run("casas", `
create temp table sh as select n, gen_random_uuid() id, (select id from su where su.n=g.n) owner from generate_series(1,200) g(n);
insert into houses(id,owner_id,name,slug,plan,category,created_at) select id, owner, 'Casa '||n, 'casa-'||n,
 (case when n%10<4 then 'gratis' when n%10<6 then 'base' when n%10<8 then 'intermediario' else 'maximo' end)::house_plan, 'Casa Espiritual', now()-random()*interval '100 days' from sh;`).catch(async (e) => { console.log("houses:", e.message); throw e; });
// membros: 4.000 contas ligadas a casas, com distribuição desigual (poucas casas grandes, muitas pequenas)
await run("membros e mensalidades", `
create temp table sm as select n-1400 m, id uid, 1 + floor(200 * power(random(), 2.2))::int hn from su where kind='membro';
insert into house_members(id,house_id,user_id,display_name,monthly_cents,due_day,start_month,consent_at,consent_version)
 select gen_random_uuid(), sh.id, sm.uid, 'Membro '||sm.m, 5000, 1+sm.m%28, date_trunc('month', now() - interval '3 months')::date, now(), 1 from sm join sh on sh.n=sm.hn;
insert into member_dues(member_id,house_id,month,amount_cents,due_date,status,paid_via,paid_at)
 select hm.id, hm.house_id, d.mo::date, 5000, (d.mo + (hm.due_day-1) * interval '1 day')::date,
  s.st, case when s.st='paga' then 'app' end, case when s.st='paga' then now() - random()*interval '30 days' end
 from house_members hm cross join (select date_trunc('month', now()) - (g||' months')::interval mo from generate_series(0,2) g) d
 cross join lateral (select case when d.mo = date_trunc('month', now()) and random() < .5 then 'aberta' else 'paga' end st) s;`);
await run("seguidores", `
insert into follows(follower_id, house_id, created_at)
 select distinct on (u.id, h.id) u.id, h.id, now()-random()*interval '90 days'
 from (select id from su where kind in ('cliente')) u cross join lateral (select id from sh order by random() limit 6) h
 on conflict do nothing;
insert into follows(follower_id, house_id) select sm.uid, sh.id from sm join sh on sh.n=sm.hn on conflict do nothing;
insert into follows(follower_id, house_id) select sm.uid, h.id from sm cross join lateral (select id from sh order by random() limit 2) h on conflict do nothing;`);
await run("publicações (25 por casa)", `
insert into posts(id,house_id,kind,content,created_at)
 select gen_random_uuid(), sh.id, 'geral', 'Axé! Publicação '||g||' da casa '||sh.n||'. '||repeat('Texto de exemplo para o feed. ', 6), now()-random()*interval '90 days'
 from sh cross join generate_series(1,25) g;`);
await run("curtidas (160 mil) e comentários (25 mil)", `
create temp table sp as select id, row_number() over () rn from posts;
create temp table sa as select id, row_number() over () rn from su where kind<>'casa';
insert into post_likes(post_id,user_id) select p.id, a.id from (select 1+floor(random()*5000)::int pr, 1+floor(random()*5200)::int ar from generate_series(1,160000)) x
  join sp p on p.rn=x.pr join sa a on a.rn=x.ar on conflict do nothing;
insert into post_comments(post_id,user_id,text,created_at) select p.id, a.id, 'Comentário de exemplo '||x.i, now()-random()*interval '60 days'
 from (select i, 1+floor(random()*5000)::int pr, 1+floor(random()*5200)::int ar from generate_series(1,25000) i) x join sp p on p.rn=x.pr join sa a on a.rn=x.ar;`);
await run("conversas (3.000) e mensagens (60 mil)", `
create temp table sc as select gen_random_uuid() id, a.id uid, h.owner hown, h.n hn from (select id, row_number() over () rn from su where kind<>'casa' order by random() limit 3000) a
 join sh h on h.n = 1 + (a.rn * 7) % 200;
insert into conversations(id) select id from sc;
insert into conversation_members(conversation_id,user_id) select id, uid from sc union all select id, hown from sc;
insert into messages(conversation_id,sender_id,text,read,created_at)
 select sc.id, case when g%2=0 then sc.uid else sc.hown end, 'Mensagem de exemplo '||g, g < 18, now() - ((20-g) * interval '1 day') - random()*interval '5 hours' from sc cross join generate_series(1,20) g;`);
await run("avisos (100 mil)", `
insert into notifications(user_id,text,read,created_at,kind) select su.id, 'Aviso de exemplo '||g, g>3, now()-random()*interval '30 days', null from su cross join generate_series(1,18) g;`);
await run("serviços, rituais, reservas, pedidos e pagamentos", `
insert into services(id,house_id,kind,title,price_cents,active,bookable) select gen_random_uuid(), sh.id, (array['buzios','trabalho','cartas','consulta','limpeza','outro'])[g]::service_kind, 'Serviço '||g, 8000+g*1000, true, true from sh cross join generate_series(1,6) g;
insert into events(id,house_id,title,price_cents,seats_total,starts_at,status) select gen_random_uuid(), sh.id, 'Ritual '||g, 4000, 40, now() + (g*3 - 4) * interval '1 day', 'publicado' from sh cross join generate_series(1,4) g;
create temp table se as select id, row_number() over () rn from events;
create temp table sv as select id, house_id, price_cents, row_number() over () rn from services;
insert into reservations(event_id,user_id,status,created_at) select e.id, a.id, 'confirmada', now()-random()*interval '40 days' from (select 1+floor(random()*800)::int er, 1+floor(random()*5200)::int ar from generate_series(1,9000)) x join se e on e.rn=x.er join sa a on a.rn=x.ar on conflict do nothing;
create temp table so as select gen_random_uuid() id, v.id sid, v.house_id, a.id cid, v.price_cents, x.i,
  (array['aguardando_pagamento','confirmado','em_andamento','concluido','concluido','concluido','cancelado','reembolsado'])[1+x.i%8] st
 from (select i, 1+floor(random()*1200)::int vr, 1+floor(random()*5200)::int ar from generate_series(1,8000) i) x join sv v on v.rn=x.vr join sa a on a.rn=x.ar;
insert into service_orders(id,service_id,house_id,client_id,title,price_cents,status,created_at,modality,stages_total) select id,sid,house_id,cid,'Serviço',price_cents,st,now()-random()*interval '60 days','distancia',1 from so;
insert into payments(order_id,provider,provider_ref,gross_cents,status,fee_cents,payment_method,confirmed_at,created_at,processor_fee_cents) select id,'stripe','pi_'||i,price_cents,'confirmado',round(price_cents*.15),'pix',now()-random()*interval '55 days',now()-random()*interval '56 days',round(price_cents*.01) from so where st in ('confirmado','em_andamento','concluido');
insert into payments(member_due_id,provider,provider_ref,gross_cents,status,fee_cents,payment_method,confirmed_at,created_at,processor_fee_cents) select id,'stripe','pm_'||row_number() over (),5000,'confirmado',250,'pix',paid_at,paid_at,50 from member_dues where status='paga' limit 8000;`);
await c.query("reset session_replication_role"); lap("gatilhos religados");
await run("estatísticas do banco (analyze)", "analyze");
for (const t of ["profiles","houses","house_members","member_dues","follows","posts","post_likes","post_comments","conversations","messages","notifications","services","events","reservations","service_orders","payments"]) console.log(t, (await c.query(`select count(*)::int n from ${t}`)).rows[0].n);
await c.end();

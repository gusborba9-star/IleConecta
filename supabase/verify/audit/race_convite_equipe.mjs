import pg from "pg";
const DB = process.argv[2] ?? "probe63";
const conn = async () => { const c = new pg.Client({ host: "127.0.0.1", port: 5544, user: "postgres", database: DB }); await c.connect(); return c; };
const su = await conn();
const HA = "aa000000-0000-0000-0000-0000000000aa";
const users = Array.from({ length: 6 }, (_, i) => `e${i}000000-0000-0000-0000-00000000000${i}`);
await su.query("select set_config('test.role','service_role',false)");
for (const [i, u] of users.entries()) { await su.query(`insert into auth.users(id,email) values ($1,$2) on conflict do nothing`, [u, "r" + i + "@x"]); await su.query(`insert into profiles(id,account_type,display_name) values ($1,'cliente','R${i}') on conflict do nothing`, [u]); }
await su.query(`delete from house_staff where house_id=$1`, [HA]); await su.query(`delete from house_staff_invites where house_id=$1`, [HA]);
await su.query(`insert into house_extra_seats(house_id,seats) values ($1,5) on conflict (house_id) do update set seats=5`, [HA]); // 6 acessos no total
let bad = 0; const N = 30;
for (let round = 0; round < N; round++) {
  await su.query(`delete from house_staff where house_id=$1`, [HA]); await su.query(`delete from house_staff_invites where house_id=$1`, [HA]);
  const tok = (await su.query(`insert into house_staff_invites(house_id,name,perms) values ($1,'Convidado',array['chat_reply']) returning token`, [HA])).rows[0].token;
  const cs = await Promise.all(users.slice(0, 5).map(conn));
  await Promise.all(cs.map((c, i) => c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [users[i]])));
  await Promise.all(cs.map((c) => c.query("set role authenticated")));
  const res = await Promise.all(cs.map((c) => c.query(`select accept_staff_invite($1)`, [tok]).then(() => "ok", (e) => e.message)));
  const n = (await su.query(`select count(*)::int n from house_staff where house_id=$1`, [HA])).rows[0].n;
  if (n > 1) bad++;
  await Promise.all(cs.map((c) => c.end()));
}
console.log(`rodadas com mais de 1 vínculo por convite: ${bad}/${N}`);
await su.query(`delete from house_staff where house_id=$1`, [HA]); await su.query(`delete from house_staff_invites where house_id=$1`, [HA]); await su.query(`delete from house_extra_seats where house_id=$1`, [HA]);
await su.end();

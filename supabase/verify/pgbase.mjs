import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
const CONN = { host: "127.0.0.1", port: 5544, user: "postgres" };
const MIG = new URL("../migrations/", import.meta.url).pathname;
export const STUBS = `
create extension if not exists pgcrypto; create extension if not exists "uuid-ossp"; create extension if not exists btree_gist; create extension if not exists pg_trgm;
create schema if not exists auth; create schema if not exists storage; create schema if not exists extensions; create schema if not exists vault; create schema if not exists cron; create schema if not exists net;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin; end if;
end $$;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true),''),'anon') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
create table cron.job (jobid bigserial, jobname text, schedule text, command text);
create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
create function cron.schedule(a text, b text) returns bigint language sql as $$ select 1::bigint $$;
create function cron.unschedule(a text) returns boolean language sql as $$ select true $$;
create table vault.secrets (id uuid default gen_random_uuid(), name text, secret text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(s text, n text default null, d text default null) returns uuid language sql as $$ select gen_random_uuid() $$;
create function net.http_post(url text, body jsonb default null, headers jsonb default null) returns bigint language sql as $$ select 1::bigint $$;
`;
export async function admin() { const c = new pg.Client({ ...CONN, database: "postgres" }); await c.connect(); return c; }
export async function connect(db) { const c = new pg.Client({ ...CONN, database: db }); await c.connect(); await c.query("select set_config('test.role','service_role',false)"); return c; }
export async function freshDb(name, { with64 = false, vaultSecret = null, max = Infinity } = {}) {
  const a = await admin();
  await a.query(`drop database if exists ${name} with (force)`); await a.query(`create database ${name}`); await a.end();
  const c = await connect(name);
  await c.query(STUBS);
  // Vault simulado do harness (vault.secrets -> view decrypted_secrets): permite exercitar a função REAL da migration 0065, sem stub.
  if (vaultSecret) await c.query(`insert into vault.secrets(name, secret) values ('cron_secret', '${vaultSecret}')`);
  const failed = [];
  for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && (with64 || !f.startsWith("0064")) && Number(f.slice(0, 4)) <= max).sort()) {
    let sql = readFileSync(MIG + f, "utf8").replace(/create extension[^;]*(pg_cron|pg_net|supabase_vault)[^;]*;/gi, "");
    try { await c.query(sql); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 120)}`); }
  }
  return { c, failed };
}
export const sql64 = () => readFileSync(MIG + "0064_payment_provider_decoupling.sql", "utf8");

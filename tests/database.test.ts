import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("migrazione, importazione idempotente, riconciliazione e isolamento MFA", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.jwt(), auth.uid() to authenticated;`);
    await db.exec(await readFile(new URL("../supabase/migrations/202610100001_finance.sql", import.meta.url), "utf8"));
    await db.query("insert into auth.users values ($1),($2)", [owner, other]);
    await db.query("insert into public.app_owner(user_id) values ($1)", [owner]);
    const item = { account_key: "fineco", date: "2026-02-02", description: "Cena", amount_cents: -3000, currency: "EUR", kind: "expense", category: "Ristoranti", source: "api", fingerprint: "bank-cena", external_reference: "unique-bank-id", raw: {} };
    const first = await db.query<{ count: number }>("select public.import_transactions($1, $2::jsonb) as count", [owner, JSON.stringify([item])]);
    assert.equal(first.rows[0].count, 1);
    const repeat = await db.query<{ count: number }>("select public.import_transactions($1, $2::jsonb) as count", [owner, JSON.stringify([item])]);
    assert.equal(repeat.rows[0].count, 0);
    await assert.rejects(db.query("select public.import_transactions($1, $2::jsonb)", [other, JSON.stringify([item])]));
    await db.query("select public.import_transactions($1, $2::jsonb)", [owner, JSON.stringify([{ ...item, fingerprint: "manual-cena", source: "manual", external_reference: null, date: "2026-01-31", category: "Casa" }])]);
    const ids = await db.query<{ id: string; source: string }>("select id,source from public.transactions order by source");
    const bank = ids.rows.find(row => row.source === "api")!.id;
    const manual = ids.rows.find(row => row.source === "manual")!.id;
    await db.query("select public.reconcile_transactions($1,$2,$3)", [owner, manual, bank]);
    const result = await db.query<{ date: string; category: string }>("select date::text,category from public.transactions where id=$1", [bank]);
    assert.equal(result.rows[0].date, "2026-01-31");
    assert.equal(result.rows[0].category, "Casa");
    await assert.rejects(db.query("select public.reconcile_transactions($1,$2,$3)", [owner, manual, bank]));
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: owner, aal: "aal1" })]);
    assert.equal((await db.query("select * from public.transactions")).rows.length, 0);
    assert.equal((await db.query("select * from public.categories")).rows.length, 0);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: other, aal: "aal2" })]);
    assert.equal((await db.query("select * from public.transactions")).rows.length, 0);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: owner, aal: "aal2" })]);
    assert.equal((await db.query("select * from public.transactions")).rows.length, 2);
    assert.equal((await db.query("select * from public.categories")).rows.length, 11);
    await assert.rejects(db.query("select * from public.bank_connections"));
    await assert.rejects(db.query("select * from public.bank_states"));
    await assert.rejects(db.query("select public.import_transactions($1, $2::jsonb)", [owner, "[]"]));
  } finally { await db.close(); }
});
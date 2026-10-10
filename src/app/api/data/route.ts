import { randomUUID } from "node:crypto";
import { z } from "zod";
import { importCsv } from "@/lib/csv";
import { adminDb, failure, HttpError, readBody, requireOwner, saveImported, verifyOrigin } from "@/lib/server";
import { syncBank } from "@/lib/banking";
import { categorize } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const name = z.string().trim().min(1).max(60);
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("manual"), date: z.iso.date(), description: z.string().trim().min(1).max(2000), amount_cents: z.number().int().min(-999999999999).max(999999999999).refine(value => value !== 0),
    kind: z.enum(["expense", "income", "refund", "withdrawal", "transfer"]), category: name.nullable(), account_key: z.string().min(1).max(200), refund_of: z.uuid().nullable().optional() }),
  z.object({ action: z.literal("edit"), id: z.uuid(), category: name.nullable(), kind: z.enum(["expense", "income", "refund", "withdrawal", "transfer"]), refund_of: z.uuid().nullable() }),
  z.object({ action: z.literal("delete"), id: z.uuid() }),
  z.object({ action: z.literal("reconcile"), manual: z.uuid(), bank: z.uuid() }),
  z.object({ action: z.literal("rule"), pattern: z.string().trim().min(1).max(150), category: name, priority: z.number().int().min(0).max(1000) }),
  z.object({ action: z.literal("deleteRule"), id: z.uuid() }),
  z.object({ action: z.literal("applyRules") }),
  z.object({ action: z.literal("category"), name, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  z.object({ action: z.literal("renameCategory"), oldName: name, newName: name }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("import"), csv: z.string().max(1500000), mapping: z.object({ date: z.string(), description: z.string(), amount: z.string(), credit: z.string().optional(), currency: z.string().optional(), reference: z.string().optional(), account: z.string().min(1).max(200), locale: z.enum(["it", "en"]) }) }),
]);

export async function GET() {
  try {
    const { db } = await requireOwner();
    const transactions = [];
    for (let offset = 0; ; offset += 1000) {
      const response = await db.from("transactions").select("id,account_key,date,description,amount_cents,currency,kind,category,source,reconciled_to,refund_of").order("date", { ascending: false }).order("id").range(offset, offset + 999);
      if (response.error) throw new HttpError(500, "Schema dati non configurato");
      transactions.push(...response.data);
      if (response.data.length < 1000) break;
      if (transactions.length >= 50000) throw new HttpError(413, "Storico oltre il limite della prima versione");
    }
    const [rules, categories, coverage, bank] = await Promise.all([
      db.from("rules").select("*").order("priority"), db.from("categories").select("*").order("name"), db.from("coverage").select("*").order("from_date"),
      adminDb().from("bank_connections").select("account_key,valid_until,balance,synced_at,last_error"),
    ]);
    if (rules.error || categories.error || coverage.error || bank.error) throw new HttpError(500, "Schema dati non configurato");
    return Response.json({ transactions, rules: rules.data, categories: categories.data, coverage: coverage.data, bank: bank.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const { user } = await requireOwner();
    const parsed = action.safeParse(await readBody(request));
    if (!parsed.success) throw new HttpError(400, "Campi non validi");
    const input = parsed.data;
    const db = adminDb();
    const fail = (error: unknown) => { if (error) throw new HttpError(400, "Operazione non consentita: verifica importo, categoria e collegamenti"); };
    if (input.action === "sync") return Response.json({ inserted: await syncBank(user.id) });
    if (input.action === "import") {
      const rules = await db.from("rules").select("*"); fail(rules.error);
      const imported = importCsv(input.csv, input.mapping, rules.data || []);
      if (imported.errors.length) throw new HttpError(400, imported.errors.slice(0, 5).join("; "));
      const inserted = await saveImported(user.id, imported.transactions);
      const dates = imported.transactions.map(transaction => transaction.date).sort();
      if (dates.length) { const coverage = await db.from("coverage").insert({ account_key: input.mapping.account, from_date: dates[0], to_date: dates.at(-1), source: "csv", verified: false }); fail(coverage.error); }
      return Response.json({ inserted, duplicates: imported.transactions.length - inserted });
    }
    if (input.action === "manual") {
      const { action: omitted, ...record } = input; void omitted;
      if (!record.category) {
        const rules = await db.from("rules").select("*"); fail(rules.error);
        record.category = categorize(record.description, rules.data || []);
      }
      if (record.refund_of) {
        const original = await db.from("transactions").select("kind,currency").eq("id", record.refund_of).eq("user_id", user.id).single();
        if (original.error || original.data.kind !== "expense") throw new HttpError(400, "Seleziona una spesa originale valida");
      }
      const response = await db.from("transactions").insert({ ...record, user_id: user.id, source: "manual", fingerprint: randomUUID(), currency: "EUR", category_locked: !!record.category }); fail(response.error);
    } else if (input.action === "edit") {
      if (input.refund_of) {
        const original = await db.from("transactions").select("kind,currency").eq("id", input.refund_of).eq("user_id", user.id).single();
        if (original.error || original.data.kind !== "expense" || input.id === input.refund_of) throw new HttpError(400, "Rimborso non valido");
      }
      const response = await db.from("transactions").update({ category: input.category, kind: input.kind, refund_of: input.kind === "refund" ? input.refund_of : null, category_locked: true }).eq("id", input.id).eq("user_id", user.id).is("reconciled_to", null); fail(response.error);
    } else if (input.action === "delete") {
      const response = await db.from("transactions").delete().eq("id", input.id).eq("user_id", user.id).eq("source", "manual").is("reconciled_to", null); fail(response.error);
    } else if (input.action === "reconcile") {
      const response = await db.rpc("reconcile_transactions", { owner: user.id, manual_id: input.manual, bank_id: input.bank }); fail(response.error);
    } else if (input.action === "category") {
      const response = await db.from("categories").upsert({ name: input.name, color: input.color }); fail(response.error);
    } else if (input.action === "renameCategory") {
      const response = await db.from("categories").update({ name: input.newName }).eq("name", input.oldName); fail(response.error);
    } else if (input.action === "rule") {
      const response = await db.from("rules").upsert({ pattern: input.pattern.toLowerCase(), category: input.category, priority: input.priority }, { onConflict: "pattern" }); fail(response.error);
    } else if (input.action === "deleteRule") {
      const response = await db.from("rules").delete().eq("id", input.id); fail(response.error);
    } else if (input.action === "applyRules") {
      const rules = await db.from("rules").select("*"); fail(rules.error);
      for (let offset = 0; ; offset += 1000) {
        const batch = await db.from("transactions").select("id,description").eq("user_id", user.id).eq("category_locked", false).is("reconciled_to", null).order("id").range(offset, offset + 999); fail(batch.error);
        for (const transaction of batch.data || []) { const result = await db.from("transactions").update({ category: categorize(transaction.description, rules.data || []) }).eq("id", transaction.id).eq("category_locked", false); fail(result.error); }
        if ((batch.data?.length || 0) < 1000) break;
      }
    }
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
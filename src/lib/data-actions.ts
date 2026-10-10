import { randomUUID } from "node:crypto";
import { z } from "zod";
import { importCsv } from "./csv";
import { adminDb, atomic, HttpError, saveImported } from "./server";
import { syncBank } from "./banking";
import { categorize, reconciliationCandidates, type Rule, type Transaction } from "./finance";
import type { RecordData } from "./appwrite-store";

const name = z.string().trim().min(1).max(60);
const identifier = z.string().min(1).max(200);
const kind = z.enum(["expense", "income", "refund", "withdrawal", "transfer"]);
export const dataAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("manual"), date: z.iso.date(), description: z.string().trim().min(1).max(2000), amount_cents: z.number().int().min(-999999999999).max(999999999999).refine(value => value !== 0), kind, category: name.nullable(), account_key: identifier, refund_of: identifier.nullable().optional() }),
  z.object({ action: z.literal("edit"), id: identifier, category: name.nullable(), kind, refund_of: identifier.nullable() }),
  z.object({ action: z.literal("delete"), id: identifier }),
  z.object({ action: z.literal("reconcile"), manual: identifier, bank: identifier }),
  z.object({ action: z.literal("rule"), pattern: z.string().trim().min(1).max(150), category: name, priority: z.number().int().min(0).max(1000) }),
  z.object({ action: z.literal("deleteRule"), id: identifier }),
  z.object({ action: z.literal("applyRules") }),
  z.object({ action: z.literal("category"), name, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  z.object({ action: z.literal("renameCategory"), oldName: name, newName: name }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("import"), csv: z.string().max(1500000), mapping: z.object({ date: z.string(), description: z.string(), amount: z.string(), credit: z.string().optional(), currency: z.string().optional(), reference: z.string().optional(), account: identifier, locale: z.enum(["it", "en"]) }) }),
]);
export type StoredTransaction = Transaction & RecordData & { user_id: string; category_locked: boolean };
export async function performDataAction(input: z.infer<typeof dataAction>, userId: string) {
  const db = adminDb();
  const rules = () => db.list<Rule & RecordData>("rules");
  const owned = async (id: string) => { const row = await db.get<StoredTransaction>("transactions", id); if (!row || row.user_id !== userId) throw new HttpError(404, "Movimento non trovato"); return row; };
  const validateCategory = async (category: string | null) => { if (category && !await db.get("categories", category)) throw new HttpError(400, "Categoria non valida"); };
  const validateKind = (type: string, amount: number) => { if ((["income", "refund"].includes(type) && amount < 0) || (["expense", "withdrawal"].includes(type) && amount > 0)) throw new HttpError(400, "Il tipo non corrisponde al segno dell'importo"); };
  if (input.action === "sync") return { inserted: await syncBank(userId) };
  if (input.action === "import") {
    const imported = importCsv(input.csv, input.mapping, await rules());
    if (imported.errors.length) throw new HttpError(400, imported.errors.slice(0, 5).join("; "));
    const inserted = await saveImported(userId, imported.transactions);
    const dates = imported.transactions.map(row => row.date).sort();
    if (dates.length) await db.create("coverage", { id: randomUUID(), account_key: input.mapping.account, from_date: dates[0], to_date: dates.at(-1), source: "csv", verified: false });
    return { inserted, duplicates: imported.transactions.length - inserted };
  }
  if (input.action === "manual" || input.action === "edit") {
    await validateCategory(input.category);
    const original = input.refund_of ? await owned(input.refund_of) : null;
    if (original && (input.kind !== "refund" || original.kind !== "expense" || original.currency !== "EUR" || (input.action === "edit" && original.id === input.id))) throw new HttpError(400, "Rimborso non valido");
    if (input.action === "manual") {
      validateKind(input.kind, input.amount_cents);
      await db.create("transactions", { id: randomUUID(), user_id: userId, account_key: input.account_key, date: input.date, description: input.description, amount_cents: input.amount_cents, currency: "EUR", kind: input.kind,
        category: input.category || categorize(input.description, await rules()), category_locked: !!input.category, source: "manual", refund_of: input.refund_of || null, reconciled_to: null });
    } else {
      const current = await owned(input.id); validateKind(input.kind, current.amount_cents);
      if (current.reconciled_to) throw new HttpError(409, "Modifica il movimento bancario riconciliato");
      await db.update("transactions", input.id, { category: input.category, kind: input.kind, refund_of: input.kind === "refund" ? input.refund_of : null, category_locked: true });
    }
  } else if (input.action === "delete") {
    const current = await owned(input.id);
    if (current.source !== "manual" || current.reconciled_to || (await db.list<StoredTransaction>("transactions")).some(row => row.refund_of === input.id)) throw new HttpError(409, "Movimento non eliminabile");
    await db.remove("transactions", input.id);
  } else if (input.action === "reconcile") {
    await atomic(async store => {
      const rows = (await store.list<StoredTransaction>("transactions")).filter(row => row.user_id === userId);
      const manual = rows.find(row => row.id === input.manual);
      const bank = rows.find(row => row.id === input.bank);
      if (!manual || !bank || !reconciliationCandidates(manual, rows).some(row => row.id === bank.id)) throw new HttpError(409, "Riconciliazione non valida o gia completata");
      await store.update("transactions", manual.id, { reconciled_to: bank.id });
      await store.update("transactions", bank.id, { date: manual.date, category: manual.category || bank.category, category_locked: manual.category_locked || bank.category_locked });
    });
  } else if (input.action === "category") { await db.put("categories", { id: input.name, name: input.name, color: input.color }); }
  else if (input.action === "renameCategory") {
    await atomic(async store => {
      const original = await store.get("categories", input.oldName);
      if (!original || await store.get("categories", input.newName)) throw new HttpError(409, "Nome categoria non disponibile");
      await store.create("categories", { ...original, id: input.newName, name: input.newName });
      for (const entity of ["transactions", "rules"]) for (const row of await store.list(entity)) if (row.category === input.oldName) await store.update(entity, row.id, { category: input.newName });
      await store.remove("categories", input.oldName);
    });
  } else if (input.action === "rule") {
    await validateCategory(input.category);
    const pattern = input.pattern.toLowerCase();
    const existing = (await rules()).find(rule => rule.pattern === pattern);
    await db.put("rules", { id: existing?.id || randomUUID(), pattern, category: input.category, priority: input.priority });
  } else if (input.action === "deleteRule") { await db.remove("rules", input.id); }
  else if (input.action === "applyRules") {
    const currentRules = await rules();
    for (const row of await db.list<StoredTransaction>("transactions")) if (row.user_id === userId && !row.category_locked && !row.reconciled_to) await db.update("transactions", row.id, { category: categorize(row.description, currentRules) });
  }
  return { ok: true };
}
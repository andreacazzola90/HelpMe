import Decimal from "decimal.js";

export type Kind = "expense" | "income" | "refund" | "withdrawal" | "transfer";
export type Transaction = {
  id: string;
  account_key: string;
  date: string;
  description: string;
  amount_cents: number;
  currency: string;
  kind: Kind;
  category: string | null;
  source: "manual" | "csv" | "api";
  reconciled_to: string | null;
  refund_of: string | null;
};
export type Rule = { id: string; pattern: string; category: string; priority: number };
export const categories = ["Alimentari", "Casa", "Trasporti", "Ristoranti", "Shopping", "Salute", "Tempo libero", "Servizi", "Prelievi", "Trasferimenti", "Stipendio"];
export const colors = ["#19765b", "#d19a22", "#427dba", "#cf6265", "#758e55", "#8a729e", "#519e9a", "#be7c45", "#636b73"];

export function parseMoney(value: string, locale: "it" | "en" = "it") {
  const clean = value.trim().replace(/\s|EUR|€/gi, "");
  const normalized = locale === "it" ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/,/g, "");
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Importo non valido: " + value);
  const cents = new Decimal(normalized).times(100).toNumber();
  if (!Number.isSafeInteger(cents)) throw new Error("Importo fuori intervallo");
  return cents;
}

export function parseDate(value: string): string {
  const text = value.trim();
  const italian = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(text);
  const iso = italian ? `${italian[3]}-${italian[2]}-${italian[1]}` : text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Data non valida: " + value);
  const parsed = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) throw new Error("Data non valida: " + value);
  return iso;
}

export function categorize(description: string, rules: Rule[]) {
  const text = description.toLocaleLowerCase("it");
  return [...rules].sort((first, second) => first.priority - second.priority || first.id.localeCompare(second.id))
    .find(rule => text.includes(rule.pattern.toLocaleLowerCase("it")))?.category ?? null;
}

export function inferKind(description: string, amount: number): Kind {
  if (/\bgiroconto\b|trasferimento tra conti propri/i.test(description)) return "transfer";
  if (amount < 0 && /\bprelievo\b|\batm withdrawal\b/i.test(description)) return "withdrawal";
  if (amount > 0 && /\brimborso\b|\brefund\b/i.test(description)) return "refund";
  return amount < 0 ? "expense" : "income";
}

export function activeTransactions(transactions: Transaction[]) {
  const ids = new Set(transactions.map(transaction => transaction.id));
  return transactions.filter(transaction => !transaction.reconciled_to || !ids.has(transaction.reconciled_to));
}

export function analyze(transactions: Transaction[], from: string, to: string, category?: string) {
  const active = activeTransactions(transactions);
  const lookup = new Map(transactions.map(transaction => [transaction.id, transaction]));
  const effectiveCategory = (transaction: Transaction) => transaction.kind === "refund" && transaction.refund_of
    ? lookup.get(transaction.refund_of)?.category ?? transaction.category : transaction.category;
  const selected = active.filter(transaction => transaction.date >= from && transaction.date <= to && transaction.currency === "EUR"
    && (!category || (effectiveCategory(transaction) ?? "Da categorizzare") === category));
  let income = 0;
  let expense = 0;
  let refunds = 0;
  let outgoing = 0;
  const byCategory = new Map<string, number>();
  const byMonth = new Map<string, { month: string; income: number; expense: number; outgoing: number }>();
  for (const transaction of selected) {
    const amount = Math.abs(transaction.amount_cents);
    const month = transaction.date.slice(0, 7);
    const bucket = byMonth.get(month) ?? { month, income: 0, expense: 0, outgoing: 0 };
    const isOutflow = transaction.amount_cents < 0;
    if (isOutflow) { outgoing += amount; bucket.outgoing += amount; }
    if (transaction.kind === "income") { income += amount; bucket.income += amount; }
    if (transaction.kind === "expense" || transaction.kind === "refund") {
      const signed = transaction.kind === "refund" ? -amount : amount;
      if (transaction.kind === "refund") refunds += amount; else expense += amount;
      bucket.expense += signed;
      const label = effectiveCategory(transaction) ?? "Da categorizzare";
      byCategory.set(label, (byCategory.get(label) ?? 0) + signed);
    }
    byMonth.set(month, bucket);
  }
  return { income, expense, refunds, netExpense: expense - refunds, outgoing, result: income - expense + refunds,
    byCategory: [...byCategory].map(([name, amount]) => ({ name, amount })).sort((first, second) => second.amount - first.amount),
    byMonth: [...byMonth.values()].sort((first, second) => first.month.localeCompare(second.month)), selected };
}

export function reconciliationCandidates(manual: Transaction, transactions: Transaction[]) {
  if (manual.source !== "manual" || manual.kind !== "expense" || manual.account_key === "cash" || manual.reconciled_to) return [];
  return transactions.filter(transaction => transaction.source !== "manual" && transaction.kind === "expense"
    && transaction.account_key === manual.account_key && transaction.currency === manual.currency
    && transaction.amount_cents === manual.amount_cents
    && Math.abs(Date.parse(transaction.date) - Date.parse(manual.date)) <= 7 * 86400000
    && !transactions.some(other => other.reconciled_to === transaction.id));
}

export function buildTrend(transactions: Transaction[], from: string, to: string) {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  const mode = days <= 62 ? "day" : days <= 7300 ? "month" : "year";
  const width = mode === "day" ? 10 : mode === "month" ? 7 : 4;
  const buckets = new Map<string, { month: string; income: number; expense: number }>();
  for (const transaction of transactions) {
    if (transaction.date < from || transaction.date > to || transaction.currency !== "EUR") continue;
    const key = transaction.date.slice(0, width);
    const bucket = buckets.get(key) || { month: key, income: 0, expense: 0 };
    if (transaction.kind === "income") bucket.income += Math.abs(transaction.amount_cents) / 100;
    if (transaction.kind === "expense") bucket.expense += Math.abs(transaction.amount_cents) / 100;
    if (transaction.kind === "refund") bucket.expense -= Math.abs(transaction.amount_cents) / 100;
    buckets.set(key, bucket);
  }
  const points: { month: string; income: number | null; expense: number | null }[] = [];
  const start = mode === "day" ? from : mode === "month" ? from.slice(0, 7) + "-01" : from.slice(0, 4) + "-01-01";
  for (const cursor = new Date(start + "T12:00:00Z"); cursor.toISOString().slice(0, width) <= to.slice(0, width); ) {
    const key = cursor.toISOString().slice(0, width);
    points.push(buckets.get(key) || { month: key, income: null, expense: null });
    if (mode === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (mode === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    if (points.length > 1000) break;
  }
  return points;
}

export function trendLabel(value: string) {
  if (value.length === 4) return value;
  const date = new Date((value.length === 7 ? value + "-01" : value) + "T12:00:00Z");
  return date.toLocaleDateString("it-IT", value.length === 10 ? { day: "2-digit", month: "short" } : { month: "short", year: "2-digit" });
}

export const money = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
export const defaultRules: Rule[] = [
  { id: "1", pattern: "esselunga", category: "Alimentari", priority: 10 },
  { id: "2", pattern: "supermercato", category: "Alimentari", priority: 20 },
  { id: "3", pattern: "ristorante", category: "Ristoranti", priority: 10 },
  { id: "4", pattern: "netflix", category: "Servizi", priority: 10 },
  { id: "5", pattern: "farmacia", category: "Salute", priority: 10 },
  { id: "6", pattern: "trenitalia", category: "Trasporti", priority: 10 },
  { id: "7", pattern: "affitto", category: "Casa", priority: 10 },
];
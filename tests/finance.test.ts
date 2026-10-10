import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, buildTrend, categorize, inferKind, parseDate, parseMoney, reconciliationCandidates, type Transaction } from "../src/lib/finance";

const entry = (changes: Partial<Transaction>): Transaction => ({ id: "a", account_key: "fineco", date: "2026-01-31", description: "Acquisto",
  amount_cents: -3000, currency: "EUR", kind: "expense", category: "Ristoranti", source: "manual", reconciled_to: null, refund_of: null, ...changes });

test("prelievo e contanti danno 130 EUR di uscite ma 30 EUR di consumi", () => {
  const totals = analyze([entry({ id: "withdraw", kind: "withdrawal", amount_cents: -10000, source: "api" }), entry({ account_key: "cash" })], "2026-01-01", "2026-01-31");
  assert.equal(totals.outgoing, 13000);
  assert.equal(totals.netExpense, 3000);
});
test("riconciliazione tra manuale e banca anche oltre il confine del mese", () => {
  const bank = entry({ id: "bank", source: "api", date: "2026-02-02" });
  const manual = entry({ reconciled_to: "bank" });
  const january = analyze([bank, manual], "2026-01-01", "2026-01-31");
  assert.equal(january.outgoing, 0);
  assert.equal(analyze([bank, manual], "2026-02-01", "2026-02-28").outgoing, 3000);
});
test("rimborso nel proprio mese e nella categoria originale", () => {
  const purchase = entry({ id: "purchase", amount_cents: -8000 });
  const refund = entry({ id: "refund", date: "2026-02-10", amount_cents: 2000, kind: "refund", category: "Shopping", refund_of: "purchase", source: "api" });
  assert.equal(analyze([purchase, refund], "2026-01-01", "2026-01-31").netExpense, 8000);
  const february = analyze([purchase, refund], "2026-02-01", "2026-02-28");
  assert.equal(february.netExpense, -2000);
  assert.equal(february.income, 0);
  assert.equal(february.byCategory[0].name, "Ristoranti");
  assert.equal(analyze([purchase, refund], "2026-01-01", "2026-02-28").netExpense, 6000);
});
test("importi e date rigorosi", () => {
  assert.equal(parseMoney("1.234,56"), 123456);
  assert.equal(parseMoney("-0.29", "en"), -29);
  assert.equal(parseDate("31/01/2026"), "2026-01-31");
  assert.throws(() => parseDate("31/02/2026"));
  assert.throws(() => parseMoney("12,345"));
});
test("regole deterministiche e candidati non riconciliabili con contanti", () => {
  assert.equal(categorize("ESSELUNGA Milano", [{ id: "x", priority: 1, pattern: "esselunga", category: "Alimentari" }]), "Alimentari");
  assert.equal(categorize("Sconosciuto", []), null);
  assert.equal(reconciliationCandidates(entry({ account_key: "cash" }), [entry({ source: "api" })]).length, 0);
  assert.equal(reconciliationCandidates(entry({}), [entry({ id: "bank", source: "api", date: "2026-02-02" })]).length, 1);
});

test("prelievi, giroconti e rimborsi non sono spese ordinarie", () => {
  assert.equal(inferKind("PRELIEVO ATM MILANO", -10000), "withdrawal");
  assert.equal(inferKind("Giroconto", 50000), "transfer");
  assert.equal(inferKind("Rimborso acquisto online", 2000), "refund");
  assert.equal(inferKind("Ristorante", -3000), "expense");
});

test("intervalli brevi giornalieri e giorni mancanti non trasformati in zero", () => {
  const points = buildTrend([entry({ date: "2026-01-01" })], "2026-01-01", "2026-01-03");
  assert.equal(points.length, 3);
  assert.equal(points[0].expense, 30);
  assert.equal(points[1].expense, null);
  assert.equal(buildTrend([entry({})], "2026-01-01", "2026-06-30").length, 6);
});
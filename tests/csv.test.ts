import { test } from "node:test";
import assert from "node:assert/strict";
import { exportCsv, importCsv, readCsv } from "../src/lib/csv";

const mapping = { date: "Data", description: "Descrizione", amount: "Importo", locale: "it" as const, account: "fineco" };
test("CSV italiano con delimitatore rilevato e campi quotati", () => {
  const data = '\uFEFFData;Descrizione;Importo\n31/01/2026;"Negozio; Milano";-1.234,56\n';
  const result = importCsv(data, mapping, []);
  assert.equal(result.errors.length, 0);
  assert.equal(result.transactions[0].amount_cents, -123456);
  assert.equal(result.transactions[0].description, "Negozio; Milano");
});
test("due acquisti identici vengono conservati distinti", () => {
  const result = importCsv("Data;Descrizione;Importo\n01/01/2026;Metro;-2,00\n01/01/2026;Metro;-2,00", mapping, []);
  assert.deepEqual(result.transactions.map(transaction => transaction.occurrence), [1, 2]);
});
test("errori di riga visibili e colonne obbligatorie verificate", () => {
  assert.equal(importCsv("Data;Descrizione;Importo\n31/02/2026;Metro;-2,00", mapping, []).errors.length, 1);
  assert.throws(() => importCsv("Data;Nome;Importo\n01/01/2026;Metro;-2,00", mapping, []));
  assert.equal(readCsv("Data;Nome\n01/01/2026;Metro").headers.length, 2);
});
test("colonne separate entrata e uscita", () => {
  const result = importCsv("Data;Descrizione;Uscita;Entrata\n01/01/2026;Stipendio;;2.000,00\n02/01/2026;Metro;2,00;", { ...mapping, amount: "Uscita", credit: "Entrata" }, []);
  assert.deepEqual(result.transactions.map(transaction => transaction.amount_cents), [200000, -200]);
});

test("esportazione protegge formule e conserva importi negativi", () => {
  const result = importCsv("Data;Descrizione;Importo\n01/01/2026;=HYPERLINK(1);-2,00", mapping, []);
  const exported = exportCsv(result.transactions.map(transaction => ({ ...transaction, id: "a", reconciled_to: null, refund_of: null })));
  const parsed = readCsv(exported);
  assert.equal(parsed.rows[0].Descrizione, "'=HYPERLINK(1)");
  assert.equal(parsed.rows[0].Importo, "-2,00");
});
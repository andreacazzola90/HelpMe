import Papa from "papaparse";
import { categorize, inferKind, parseDate, parseMoney, type Rule, type Transaction } from "./finance";

export type CsvMapping = { date: string; description: string; amount: string; credit?: string; currency?: string; reference?: string; locale: "it" | "en"; account: string };
export type Imported = Omit<Transaction, "id" | "reconciled_to" | "refund_of"> & { external_reference: string | null; raw: Record<string, unknown>; occurrence: number };

export function readCsv(text: string) {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: header => header.trim() });
  if (parsed.errors.length) throw new Error("CSV non valido: " + parsed.errors[0].message);
  if (!parsed.meta.fields?.length || new Set(parsed.meta.fields).size !== parsed.meta.fields.length) throw new Error("Intestazioni CSV mancanti o duplicate");
  return { headers: parsed.meta.fields, rows: parsed.data };
}

export function exportCsv(transactions: Transaction[]) {
  return "\uFEFF" + Papa.unparse({ fields: ["Data", "Descrizione", "Importo", "Valuta", "Tipo", "Categoria"],
    data: transactions.map(transaction => [transaction.date, transaction.description, (transaction.amount_cents / 100).toFixed(2).replace(".", ","),
      transaction.currency, transaction.kind, transaction.category || "Da categorizzare"]) },
  { delimiter: ";", quotes: true, escapeFormulae: /^[=+@\t\r]|^-(?!\d+(?:[.,]\d+)?$)/ });
}

export function importCsv(text: string, mapping: CsvMapping, rules: Rule[]) {
  const { rows, headers } = readCsv(text);
  for (const field of [mapping.date, mapping.description, mapping.amount, mapping.credit, mapping.currency, mapping.reference].filter(Boolean)) {
    if (!headers.includes(field!)) throw new Error("Colonna mancante: " + field);
  }
  const occurrences = new Map<string, number>();
  const errors: string[] = [];
  const transactions: Imported[] = [];
  for (const [index, row] of rows.entries()) {
    try {
      const date = parseDate(row[mapping.date]);
      const description = row[mapping.description]?.trim();
      if (!description) throw new Error("Descrizione mancante");
      const debit = row[mapping.amount]?.trim();
      const credit = mapping.credit && row[mapping.credit]?.trim();
      if (mapping.credit && debit && credit) throw new Error("Entrata e uscita presenti nella stessa riga");
      const amount = mapping.credit ? (credit ? Math.abs(parseMoney(credit, mapping.locale)) : -Math.abs(parseMoney(debit || "0", mapping.locale))) : parseMoney(debit || "0", mapping.locale);
      if (!amount) throw new Error("Importo nullo");
      const currency = (mapping.currency ? row[mapping.currency] : "EUR")?.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Valuta non valida");
      const identity = JSON.stringify([mapping.account, date, description.toLowerCase().replace(/\s+/g, " "), amount, currency]);
      const occurrence = (occurrences.get(identity) ?? 0) + 1;
      occurrences.set(identity, occurrence);
      const kind = inferKind(description, amount);
      transactions.push({ account_key: mapping.account, date, description, amount_cents: amount, currency, kind,
        category: categorize(description, rules) || (kind === "withdrawal" ? "Prelievi" : kind === "transfer" ? "Trasferimenti" : null), source: "csv", external_reference: mapping.reference ? row[mapping.reference]?.trim() || null : null, raw: row, occurrence });
    } catch (error) { errors.push(`Riga ${index + 2}: ${(error as Error).message}`); }
  }
  return { transactions, errors };
}
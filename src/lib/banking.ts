import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { createBankToken } from "./bank-token";
import { adminDb, HttpError, required, saveImported } from "./server";
import { categorize, inferKind, parseDate, parseMoney, type Rule } from "./finance";
import type { Imported } from "./csv";

export async function banking(path: string, body?: unknown) {
  const token = await createBankToken(required("ENABLE_BANKING_APP_ID"), required("ENABLE_BANKING_PRIVATE_KEY"));
  const response = await fetch("https://api.enablebanking.com" + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000), cache: "no-store" });
  if (!response.ok) {
    if (response.status === 401) throw new HttpError(401, "Collegamento bancario scaduto o credenziali API non valide: riconnetti Fineco");
    if (response.status === 429) throw new HttpError(429, "Limite di richieste della banca raggiunto. Riprova piu tardi.");
    throw new HttpError(502, "La banca non ha completato la richiesta. Riprova o importa un CSV.");
  }
  return response.json();
}
function encryptionKey() {
  const key = Buffer.from(required("BANK_SESSION_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new HttpError(503, "Chiave di cifratura del servizio non valida");
  return key;
}
export function encryptSession(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
function decryptSession(value: string) {
  const bytes = Buffer.from(value, "base64");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
}

const providerTransaction = z.object({
  transaction_amount: z.object({ amount: z.string(), currency: z.string().regex(/^[A-Z]{3}$/) }),
  credit_debit_indicator: z.enum(["CRDT", "DBIT"]),
  booking_date: z.string().optional().nullable(), transaction_date: z.string().optional().nullable(),
  remittance_information: z.array(z.string()).optional(), entry_reference: z.string().optional().nullable(),
  status: z.string().optional(), creditor: z.object({ name: z.string().optional() }).optional(), debtor: z.object({ name: z.string().optional() }).optional(),
}).passthrough();

export function normalizeBankTransactions(rows: unknown[], account: string, rules: Rule[]): Imported[] {
  const occurrences = new Map<string, number>();
  return rows.flatMap(raw => {
    const transaction = providerTransaction.parse(raw);
    if (transaction.status && transaction.status !== "BOOK") return [];
    const value = Math.abs(parseMoney(transaction.transaction_amount.amount, "en"));
    if (!value) return [];
    const amount = transaction.credit_debit_indicator === "DBIT" ? -value : value;
    const date = parseDate(transaction.transaction_date || transaction.booking_date || "");
    const description = transaction.remittance_information?.join(" ") || transaction.creditor?.name || transaction.debtor?.name || "Movimento bancario";
    const identity = JSON.stringify([date, description.toLowerCase().replace(/\s+/g, " "), amount, transaction.transaction_amount.currency]);
    const occurrence = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);
    const kind = inferKind(description, amount);
    return [{ account_key: account, date, description, amount_cents: amount, currency: transaction.transaction_amount.currency, kind,
      category: categorize(description, rules) || (kind === "withdrawal" ? "Prelievi" : kind === "transfer" ? "Trasferimenti" : null), source: "api" as const, external_reference: transaction.entry_reference || null, raw: transaction, occurrence }];
  });
}

export async function syncBank(owner: string) {
  const db = adminDb();
  const { data: connections, error } = await db.from("bank_connections").select("*");
  if (error) throw new HttpError(500, "Schema bancario non configurato");
  if (!connections?.length) throw new HttpError(409, "Collega Fineco prima di sincronizzare");
  const { data: rules, error: rulesError } = await db.from("rules").select("*");
  if (rulesError) throw new HttpError(500, "Categorie non disponibili");
  let inserted = 0;
  for (const connection of connections) {
    try {
      if (new Date(connection.valid_until).getTime() <= Date.now()) throw new HttpError(409, "Consenso bancario scaduto: riconnetti Fineco");
      const session = decryptSession(connection.session_encrypted);
      await banking("/sessions/" + encodeURIComponent(session));
      const start = connection.synced_at ? new Date(new Date(connection.synced_at).getTime() - 7 * 86400000).toISOString().slice(0, 10) : null;
      const query = new URLSearchParams(start ? { date_from: start } : { strategy: "longest" });
      const rows: unknown[] = [];
      let continuation: string | null = null;
      const seen = new Set<string>();
      do {
        if (continuation) { if (seen.has(continuation)) throw new HttpError(502, "Paginazione bancaria non valida"); seen.add(continuation); query.set("continuation_key", continuation); }
        const result = await banking(`/accounts/${encodeURIComponent(connection.account_uid)}/transactions?${query}`);
        if (!Array.isArray(result.transactions)) throw new HttpError(502, "Risposta della banca non valida");
        rows.push(...result.transactions);
        if (rows.length > 10000 || seen.size > 200) throw new HttpError(413, "Storico troppo esteso: integra i dati tramite CSV");
        continuation = result.continuation_key || null;
      } while (continuation);
      inserted += await saveImported(owner, normalizeBankTransactions(rows, connection.account_key, rules || []));
      const balance = await banking(`/accounts/${encodeURIComponent(connection.account_uid)}/balances`);
      const { error: updateError } = await db.from("bank_connections").update({ synced_at: new Date().toISOString(), balance, last_error: null }).eq("account_key", connection.account_key);
      if (updateError) throw new HttpError(500, "Aggiornamento del collegamento non riuscito");
      if (start) await db.from("coverage").insert({ account_key: connection.account_key, from_date: start, to_date: new Date().toISOString().slice(0, 10), source: "api", verified: true });
    } catch (error) {
      const message = error instanceof HttpError ? error.message : "Sincronizzazione non riuscita: verifica connessione e formato dei dati";
      await db.from("bank_connections").update({ last_error: message }).eq("account_key", connection.account_key);
      throw new HttpError(error instanceof HttpError ? error.status : 502, message);
    }
  }
  return inserted;
}
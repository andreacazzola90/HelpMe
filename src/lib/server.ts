import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import type { Imported } from "./csv";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new HttpError(503, "Configurazione del servizio incompleta");
  return value;
}
export const appUrl = () => required("APP_URL").replace(/\/$/, "");
export function adminDb() {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function sessionDb() {
  const store = await cookies();
  return createServerClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { experimental: { passkey: true } },
    cookies: { getAll: () => store.getAll(), setAll: values => { for (const { name, value, options } of values) store.set(name, value, options); } },
  });
}
export async function requireOwner() {
  const db = await sessionDb();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Accedi per continuare");
  if (data.user.id !== required("OWNER_USER_ID")) throw new HttpError(403, "Account non autorizzato");
  const claims = await db.auth.getClaims();
  if (claims.error || claims.data?.claims.aal !== "aal2") throw new HttpError(403, "Completa la verifica a due fattori per accedere ai dati");
  const permission = await db.rpc("owner_mfa");
  if (permission.error || permission.data !== true) throw new HttpError(403, "Proprietario non autorizzato nello schema del database");
  return { db, user: data.user };
}
export function verifyOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(appUrl()).origin) throw new HttpError(403, "Origine non autorizzata");
}
export async function readBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 2_000_000) throw new HttpError(413, "File troppo grande (massimo 2 MB)");
  const body = await request.text();
  if (body.length > 2_000_000) throw new HttpError(413, "File troppo grande (massimo 2 MB)");
  try { return JSON.parse(body); } catch { throw new HttpError(400, "Richiesta non valida"); }
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: "Operazione non riuscita. Controlla la configurazione e riprova." }, { status: 500 });
}
export function fingerprint(transaction: Imported) {
  return createHash("sha256").update(JSON.stringify([transaction.account_key, transaction.date,
    transaction.description.toLowerCase().replace(/\s+/g, " ").trim(), transaction.amount_cents, transaction.currency, transaction.occurrence])).digest("hex");
}
export async function saveImported(owner: string, transactions: Imported[]) {
  if (transactions.length > 10000) throw new HttpError(413, "Importa al massimo 10.000 movimenti per file");
  const { data, error } = await adminDb().rpc("import_transactions", { owner, items: transactions.map(transaction => ({ ...transaction, fingerprint: fingerprint(transaction) })) });
  if (error) throw new HttpError(500, "Importazione non riuscita. Controlla categorie, schema e identificativi dei movimenti.");
  return Number(data);
}
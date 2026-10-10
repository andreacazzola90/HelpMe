import "server-only";
import { Account, Client, Users } from "node-appwrite";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { AppwriteStore } from "./appwrite-store";
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
export function appwriteClient(secret?: string, admin = false) {
  const client = new Client().setEndpoint(required("APPWRITE_ENDPOINT")).setProject(required("APPWRITE_PROJECT_ID"));
  if (admin) client.setKey(required("APPWRITE_API_KEY"));
  else if (secret) client.setSession(secret);
  return client;
}
export function adminDb() { return new AppwriteStore(appwriteClient(undefined, true), process.env.APPWRITE_DATABASE_ID || "helpme"); }
export async function atomic<T>(operation: (store: AppwriteStore) => Promise<T>) {
  const client = appwriteClient(undefined, true);
  return new AppwriteStore(client, process.env.APPWRITE_DATABASE_ID || "helpme").atomic(operation, client);
}
export async function ownerId() {
  const owner = await adminDb().get("app_owner", "singleton");
  if (!owner || typeof owner.user_id !== "string") throw new HttpError(503, "Account personale non ancora attivato");
  return owner.user_id;
}
export async function ownerEmail() {
  const owner = await adminDb().get("app_owner", "singleton");
  if (!owner || typeof owner.user_id !== "string") throw new HttpError(401, "Crea prima il tuo account personale");
  if (typeof owner.email === "string") return owner.email.trim().toLowerCase();
  const user = await new Users(appwriteClient(undefined, true)).get({ userId: owner.user_id });
  return user.email.trim().toLowerCase();
}
export const sessionCookie = () => "a_session_" + required("APPWRITE_PROJECT_ID");
export async function sessionAccount() {
  const store = await cookies();
  const secret = store.get(sessionCookie())?.value;
  if (!secret) throw new HttpError(401, "Accedi per continuare");
  return new Account(appwriteClient(secret));
}
export async function setSession(secret: string, expire: string, sessionId: string, userId: string) {
  if (!secret) throw new HttpError(503, "La chiave Appwrite deve consentire la creazione delle sessioni");
  const id = createHash("sha256").update(secret).digest("hex");
  await adminDb().put("auth_sessions", { id, session_id: sessionId, user_id: userId, expires_at: expire });
  (await cookies()).set(sessionCookie(), secret, { httpOnly: true, secure: new URL(appUrl()).protocol === "https:", sameSite: "lax", path: "/", expires: new Date(expire) });
}
export async function sessionIdentity() {
  const account = await sessionAccount();
  const secret = (await cookies()).get(sessionCookie())!.value;
  const record = await adminDb().get("auth_sessions", createHash("sha256").update(secret).digest("hex"));
  if (!record || String(record.expires_at) <= new Date().toISOString()) throw new HttpError(401, "Sessione scaduta");
  const owner = await ownerId();
  if (record.user_id !== owner) throw new HttpError(403, "Account non autorizzato");
  const sessions = await new Users(appwriteClient(undefined, true)).listSessions({ userId: owner });
  const session = sessions.sessions.find(item => item.$id === record.session_id);
  if (!session) throw new HttpError(401, "Sessione revocata");
  return { account, session };
}
export async function requireOwner() {
  const { account, session } = await sessionIdentity();
  const user = await account.get();
  if (!user.emailVerification) throw new HttpError(403, "Conferma la tua email");
  const factors = await account.listMFAFactors();
  if (!user.mfa || !factors.totp || !session.factors.includes("totp")) throw new HttpError(403, "Completa la verifica a due fattori per accedere ai dati");
  return { db: adminDb(), user: { id: user.$id, email: user.email } };
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
  if ((error as { code?: number }).code === 401) return Response.json({ error: "Accesso non valido o verifica MFA necessaria" }, { status: 401 });
  if ((error as { code?: number }).code === 429) return Response.json({ error: "Troppe richieste. Riprova piu tardi." }, { status: 429 });
  return Response.json({ error: "Operazione non riuscita. Controlla la configurazione e riprova." }, { status: 500 });
}
export function fingerprint(transaction: Imported) {
  return createHash("sha256").update(JSON.stringify([transaction.account_key, transaction.date,
    transaction.description.toLowerCase().replace(/\s+/g, " ").trim(), transaction.amount_cents, transaction.currency, transaction.occurrence])).digest("hex");
}
export async function saveImported(owner: string, transactions: Imported[]) {
  if (owner !== await ownerId()) throw new HttpError(403, "Account non autorizzato");
  if (transactions.length > 10000) throw new HttpError(413, "Importa al massimo 10.000 movimenti per file");
  let inserted = 0;
  for (const transaction of transactions) {
    const identity = fingerprint(transaction);
    const reference = transaction.external_reference ? createHash("sha256").update(JSON.stringify([transaction.account_key, transaction.external_reference])).digest("hex") : null;
    inserted += await atomic(async store => {
      if (await store.get("import_identity", identity) || (reference && await store.get("import_reference", reference))) return 0;
      const id = crypto.randomUUID();
      await store.create("transactions", { ...transaction, id, user_id: owner, reconciled_to: null, refund_of: null, category_locked: false, fingerprint: identity });
      await store.create("import_identity", { id: identity, transaction_id: id });
      if (reference) await store.create("import_reference", { id: reference, transaction_id: id });
      return 1;
    });
  }
  return inserted;
}
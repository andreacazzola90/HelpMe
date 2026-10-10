import { NextResponse } from "next/server";
import { z } from "zod";
import { banking, encryptSession } from "@/lib/banking";
import { adminDb, appUrl, atomic, failure, HttpError, requireOwner } from "@/lib/server";

const sessionSchema = z.object({ session_id: z.string(), valid_until: z.string().optional(), access: z.object({ valid_until: z.string() }).optional(),
  accounts: z.array(z.object({ uid: z.string(), identification_hash: z.string() })) });
export async function GET(request: Request) {
  try {
    const { user } = await requireOwner();
    const params = new URL(request.url).searchParams;
    const state = params.get("state"); const code = params.get("code");
    if (!state || !code) throw new HttpError(400, "Autorizzazione bancaria annullata o incompleta");
    const db = adminDb();
    await atomic(async store => {
      const saved = await store.get("bank_states", state);
      if (!saved || saved.user_id !== user.id || String(saved.expires_at) <= new Date().toISOString()) throw new HttpError(400, "Richiesta scaduta o gia usata: avvia di nuovo il collegamento");
      await store.remove("bank_states", state);
    });
    const session = sessionSchema.parse(await banking("/sessions", { code }));
    if (!session.accounts.length) throw new HttpError(409, "Nessun conto autorizzato: collega prima il tuo conto nel pannello Enable Banking");
    const validUntil = session.access?.valid_until || session.valid_until;
    if (!validUntil || Number.isNaN(Date.parse(validUntil))) throw new HttpError(502, "Scadenza del consenso non disponibile");
    for (const account of session.accounts) await db.put("bank_connections", { id: account.identification_hash, account_key: account.identification_hash, account_uid: account.uid,
      session_encrypted: encryptSession(session.session_id), valid_until: validUntil, synced_at: null, last_error: null });
    return NextResponse.redirect(appUrl() + "/?bank=connected");
  } catch (error) { return failure(error); }
}
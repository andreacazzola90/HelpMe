import { randomBytes } from "node:crypto";
import { banking } from "@/lib/banking";
import { adminDb, appUrl, failure, HttpError, requireOwner, verifyOrigin } from "@/lib/server";

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const { user } = await requireOwner();
    const result = await banking("/aspsps?country=IT&service=AIS");
    const bank = result.aspsps?.find((item: { name: string }) => /fineco/i.test(item.name));
    if (!bank) throw new HttpError(409, "Fineco non risulta disponibile per questa applicazione Enable Banking. Usa l'importazione CSV.");
    const state = randomBytes(32).toString("hex");
    const db = adminDb();
    await db.from("bank_states").delete().lt("expires_at", new Date().toISOString());
    const saved = await db.from("bank_states").insert({ state, user_id: user.id, expires_at: new Date(Date.now() + 15 * 60000).toISOString() });
    if (saved.error) throw new HttpError(500, "Impossibile avviare il collegamento");
    const validSeconds = Math.min(Number(bank.maximum_consent_validity) || 86400, 180 * 86400);
    const authorization = await banking("/auth", { access: { valid_until: new Date(Date.now() + validSeconds * 1000).toISOString() }, aspsp: { name: bank.name, country: "IT" },
      state, redirect_url: appUrl() + "/api/bank/callback", psu_type: "personal" });
    if (typeof authorization.url !== "string" || new URL(authorization.url).protocol !== "https:") throw new HttpError(502, "Redirect bancario non valido");
    return Response.json({ url: authorization.url });
  } catch (error) { return failure(error); }
}
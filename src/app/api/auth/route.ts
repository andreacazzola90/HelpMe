import { Account, AuthenticationFactor, AuthenticatorType, Users } from "node-appwrite";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { adminDb, appUrl, appwriteClient, atomic, failure, HttpError, ownerEmail, ownerId, readBody, requireOwner, sessionCookie, sessionIdentity, setSession, verifyOrigin } from "@/lib/server";

const authAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), email: z.email(), password: z.string().min(1).max(256) }),
  z.object({ action: z.literal("logout") }), z.object({ action: z.literal("enroll") }),
  z.object({ action: z.literal("verifyEnrollment"), code: z.string().regex(/^\d{6}$/) }),
  z.object({ action: z.literal("challenge"), recovery: z.boolean().optional() }),
  z.object({ action: z.literal("verify"), challengeId: z.string().min(1).max(100), code: z.string().min(6).max(100) }),
  z.object({ action: z.literal("recover"), email: z.email() }),
  z.object({ action: z.literal("reset"), userId: z.string(), secret: z.string(), password: z.string().min(12).max(256) }),
  z.object({ action: z.literal("password"), password: z.string().min(12).max(256), oldPassword: z.string().min(1).max(256) }),
  z.object({ action: z.literal("verification") }),
]);
const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    if (!process.env.APPWRITE_ENDPOINT || !process.env.APPWRITE_PROJECT_ID || !process.env.APPWRITE_API_KEY) return json({ step: "login", configured: false });
    try {
      const { account, session } = await sessionIdentity();
      let user;
      try { user = await account.get(); } catch (error) {
        if ((error as { type?: string }).type === "user_more_factors_required") return json({ step: "mfa", configured: true });
        throw error;
      }
      if (!user.emailVerification) return json({ step: "confirm", configured: true });
      const factors = await account.listMFAFactors();
      if (!factors.totp) return json({ step: "enroll", configured: true });
      const strong = user.mfa && session.factors.includes("totp");
      return json({ step: strong ? "ready" : "mfa", configured: true });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return json({ step: "login", configured: true });
      if ((error as { code?: number }).code === 401) return json({ step: "login", configured: true });
      throw error;
    }
  } catch (error) { return failure(error); }
}

export async function limitAuth(request: Request, action: string) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const bucket = Math.floor(Date.now() / (15 * 60000));
  const id = createHash("sha256").update(JSON.stringify([ip, action, bucket])).digest("hex");
  await atomic(async store => {
    const row = await store.get("auth_limits", id);
    if (Number(row?.count || 0) >= 20) throw new HttpError(429, "Troppe richieste. Riprova tra qualche minuto.");
    await store.put("auth_limits", { id, count: Number(row?.count || 0) + 1, expires_at: Date.now() + 30 * 60000 });
  });
}

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const parsed = authAction.safeParse(await readBody(request));
    if (!parsed.success) throw new HttpError(400, "Campi non validi");
    const input = parsed.data;
    await limitAuth(request, input.action);
    if (input.action === "login") {
      if (input.email.trim().toLowerCase() !== await ownerEmail()) throw new HttpError(401, "Email o password non valide");
      const account = new Account(appwriteClient(undefined, true));
      const session = await account.createEmailPasswordSession({ email: input.email, password: input.password });
      if (session.userId !== await ownerId()) { await new Users(appwriteClient(undefined, true)).deleteSession({ userId: session.userId, sessionId: session.$id }); throw new HttpError(403, "Account non autorizzato"); }
      await setSession(session.secret, session.expire, session.$id, session.userId);
      return json({ ok: true });
    }
    if (input.action === "recover") {
      if (input.email.trim().toLowerCase() === await ownerEmail()) {
        await new Account(appwriteClient()).createRecovery({ email: input.email, url: appUrl() + "/?recovery=1" }).catch(() => undefined);
      }
      return json({ message: "Se l'account esiste, riceverai un'email di recupero." });
    }
    if (input.action === "reset") {
      if (input.userId !== await ownerId()) throw new HttpError(400, "Richiesta di recupero non valida");
      await new Account(appwriteClient()).updateRecovery({ userId: input.userId, secret: input.secret, password: input.password });
      return json({ ok: true });
    }
    const { account, session } = await sessionIdentity();
    if (input.action === "logout") {
      await new Users(appwriteClient(undefined, true)).deleteSession({ userId: session.userId, sessionId: session.$id });
      (await cookies()).delete(sessionCookie());
      return json({ ok: true });
    }
    if (input.action === "verification") {
      await account.createVerification({ url: appUrl() + "/auth/confirm" });
      return json({ message: "Email di conferma inviata" });
    }
    if (input.action === "enroll") {
      const user = await account.get();
      if (!user.emailVerification) throw new HttpError(403, "Conferma prima la tua email");
      const enrollment = await account.createMFAAuthenticator({ type: AuthenticatorType.Totp });
      return json({ qr: await QRCode.toDataURL(enrollment.uri), secret: enrollment.secret });
    }
    if (input.action === "verifyEnrollment") {
      await account.updateMFAAuthenticator({ type: AuthenticatorType.Totp, otp: input.code });
      await account.updateMFA({ mfa: true });
      const challenge = await account.createMFAChallenge({ factor: AuthenticationFactor.Totp });
      await account.updateMFAChallenge({ challengeId: challenge.$id, otp: input.code });
      return json({ ok: true });
    }
    if (input.action === "challenge") {
      if (input.recovery) throw new HttpError(503, "Recupero MFA non disponibile: usa Authenticator o il ripristino amministrativo");
      const challenge = await account.createMFAChallenge({ factor: AuthenticationFactor.Totp });
      await adminDb().put("mfa_challenges", { id: challenge.$id, session_id: session.$id, expires_at: Date.now() + 5 * 60000 });
      return json({ challengeId: challenge.$id });
    }
    if (input.action === "verify") {
      const record = await adminDb().get("mfa_challenges", input.challengeId);
      if (!record || record.session_id !== session.$id || Number(record.expires_at) < Date.now()) throw new HttpError(400, "Verifica scaduta: richiedi un nuovo codice");
      await account.updateMFAChallenge({ challengeId: input.challengeId, otp: input.code });
      await adminDb().remove("mfa_challenges", input.challengeId);
      return json({ ok: true });
    }
    if (input.action === "password") {
      await requireOwner();
      await account.updatePassword({ password: input.password, oldPassword: input.oldPassword });
      return json({ ok: true });
    }
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
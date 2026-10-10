import { randomBytes } from "node:crypto";
import { Account, Users } from "node-appwrite";
import { cookies } from "next/headers";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse, type RegistrationResponseJSON, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { adminDb, appUrl, appwriteClient, atomic, failure, HttpError, ownerId, readBody, requireOwner, setSession, verifyOrigin } from "@/lib/server";
import { limitAuth } from "../auth/route";
import type { RecordData } from "@/lib/appwrite-store";

type Credential = RecordData & { user_id: string; public_key: string; counter: number; transports: string[]; friendly_name: string };
const inputSchema = z.object({ action: z.enum(["registerOptions", "registerVerify", "loginOptions", "loginVerify", "list", "delete"]), response: z.unknown().optional(), id: z.string().optional() });
const cookieName = "helpme_webauthn";
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const input = inputSchema.parse(await readBody(request));
    await limitAuth(request, input.action);
    const url = new URL(appUrl());
    if (url.hostname === "127.0.0.1") throw new HttpError(503, "Per le passkey locali usa localhost come APP_URL e indirizzo del browser");
    if (url.protocol !== "https:" && !["localhost","127.0.0.1"].includes(url.hostname)) throw new HttpError(503, "Passkey disponibili solo su HTTPS");
    const userId = await ownerId(); const store = adminDb();
    if (input.action.startsWith("register") || ["list", "delete"].includes(input.action)) await requireOwner();
    if (input.action === "list") return Response.json({ passkeys: (await store.list<Credential>("passkeys")).filter(item => item.user_id === userId).map(({ id, friendly_name }) => ({ id, friendly_name })) });
    if (input.action === "delete") {
      const credential = input.id ? await store.get<Credential>("passkeys", input.id) : null;
      if (!credential || credential.user_id !== userId) throw new HttpError(404, "Passkey non trovata");
      await store.remove("passkeys", credential.id); return Response.json({ ok: true });
    }
    if (input.action.endsWith("Options")) {
      const credentials = (await store.list<Credential>("passkeys")).filter(item => item.user_id === userId);
      const options = input.action === "registerOptions" ? await generateRegistrationOptions({ rpName: "HelpMe", rpID: url.hostname, userName: "Proprietario HelpMe", userID: Buffer.from(userId),
        excludeCredentials: credentials.map(item => ({ id: item.id })), authenticatorSelection: { residentKey: "required", userVerification: "required" }, attestationType: "none" })
        : await generateAuthenticationOptions({ rpID: url.hostname, allowCredentials: credentials.map(item => ({ id: item.id })), userVerification: "required" });
      const id = randomBytes(32).toString("hex");
      await store.create("webauthn_challenges", { id, challenge: options.challenge, mode: input.action, user_id: userId, expires_at: Date.now() + 5 * 60000 });
      (await cookies()).set(cookieName, id, { httpOnly: true, secure: url.protocol === "https:", sameSite: "strict", maxAge: 300, path: "/" });
      return Response.json(options, { headers: { "Cache-Control": "no-store" } });
    }
    const id = (await cookies()).get(cookieName)?.value;
    (await cookies()).delete(cookieName);
    if (!id) throw new HttpError(400, "Richiesta passkey scaduta");
    const challenge = await atomic(async db => {
      const row = await db.get("webauthn_challenges", id);
      if (!row || Number(row.expires_at) < Date.now() || row.user_id !== userId || row.mode !== input.action.replace("Verify", "Options")) throw new HttpError(400, "Richiesta passkey non valida");
      await db.remove("webauthn_challenges", id); return row;
    });
    if (input.action === "registerVerify") {
      const verified = await verifyRegistrationResponse({ response: input.response as RegistrationResponseJSON, expectedChallenge: String(challenge.challenge), expectedOrigin: url.origin, expectedRPID: url.hostname, requireUserVerification: true });
      if (!verified.verified || !verified.registrationInfo) throw new HttpError(400, "Passkey non verificata");
      const credential = verified.registrationInfo.credential;
      await store.create("passkeys", { id: credential.id, user_id: userId, public_key: Buffer.from(credential.publicKey).toString("base64"), counter: credential.counter, transports: credential.transports || [], friendly_name: "Passkey " + new Date().toLocaleDateString("it-IT") });
      return Response.json({ ok: true });
    }
    const response = input.response as AuthenticationResponseJSON;
    if (!response || typeof response.id !== "string") throw new HttpError(400, "Passkey non valida");
    await atomic(async db => {
      const credential = await db.get<Credential>("passkeys", response.id);
      if (!credential || credential.user_id !== userId) throw new HttpError(401, "Passkey non riconosciuta");
      const verified = await verifyAuthenticationResponse({ response, expectedChallenge: String(challenge.challenge), expectedOrigin: url.origin, expectedRPID: url.hostname, requireUserVerification: true,
        credential: { id: credential.id, publicKey: Buffer.from(credential.public_key, "base64"), counter: credential.counter } });
      if (!verified.verified) throw new HttpError(401, "Passkey non verificata");
      await db.update("passkeys", credential.id, { counter: verified.authenticationInfo.newCounter });
    });
    const token = await new Users(appwriteClient(undefined, true)).createToken({ userId, expire: 60 });
    const session = await new Account(appwriteClient(undefined, true)).createSession({ userId, secret: token.secret });
    await setSession(session.secret, session.expire, session.$id, session.userId);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
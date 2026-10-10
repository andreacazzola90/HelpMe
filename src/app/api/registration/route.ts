import { z } from "zod";
import { Account, Users } from "node-appwrite";
import { storageId } from "@/lib/appwrite-store";
import { localRegistrationAllowed, registrationEmail } from "@/lib/registration-policy";
import { adminDb, appUrl, appwriteClient, failure, HttpError, readBody, setSession, verifyOrigin } from "@/lib/server";
import { limitAuth } from "../auth/route";

const registration = z.object({ email: z.email().max(254), password: z.string().min(12).max(256) });

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const input = registration.safeParse(await readBody(request));
    if (!input.success) throw new HttpError(400, "Inserisci un'email valida");
    const allowed = registrationEmail(input.data.email, process.env.OWNER_EMAIL, localRegistrationAllowed(process.env.NODE_ENV, appUrl(), request.url));
    if (!allowed) throw new HttpError(403, "Registrazione non autorizzata. Per la prima attivazione usa l'app locale oppure l'email preautorizzata dal proprietario.");
    await limitAuth(request, "register");
    const db = adminDb();
    const userId = storageId("owner", allowed);
    const existing = await db.get("app_owner", "singleton");
    if (existing) throw new HttpError(409, "L'account personale e gia stato creato. Accedi oppure recupera la password.");
    const users = new Users(appwriteClient(undefined, true));
    let created = false;
    try { await users.create({ userId, email: allowed, password: input.data.password, name: "Proprietario HelpMe" }); created = true; }
    catch (error) { if ((error as { code?: number }).code !== 409) throw error; }
    const session = await new Account(appwriteClient(undefined, true)).createEmailPasswordSession({ email: allowed, password: input.data.password });
    if (session.userId !== userId) { await users.deleteSession({ userId: session.userId, sessionId: session.$id }); throw new HttpError(409, "L'email appartiene a un account esistente. Contatta il proprietario del progetto."); }
    try { await db.create("app_owner", { id: "singleton", user_id: userId, email: allowed }); }
    catch (error) {
      const assigned = await db.get("app_owner", "singleton");
      if (assigned?.user_id !== userId) {
        await users.deleteSession({ userId, sessionId: session.$id });
        if (created) await users.delete({ userId });
        if ((error as { code?: number }).code === 409) throw new HttpError(409, "L'account personale e gia stato creato");
        throw error;
      }
    }
    await setSession(session.secret, session.expire, session.$id, session.userId);
    try {
      await new Account(appwriteClient(session.secret)).createVerification({ url: appUrl() + "/auth/confirm" });
      return Response.json({ created: true, message: "Account creato. Controlla la tua email per confermare la registrazione." }, { status: 201 });
    } catch {
      return Response.json({ created: true, message: "Account creato, ma l'email di conferma non e stata inviata. Verifica la piattaforma Web e la configurazione email in Appwrite, poi premi Reinvia conferma." }, { status: 201 });
    }
  } catch (error) { return failure(error); }
}
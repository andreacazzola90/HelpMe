import { test } from "node:test";
import assert from "node:assert/strict";
import { Account, AuthenticationFactor, AuthenticatorType, Client, TablesDB, Users } from "node-appwrite";
import { randomBytes, randomUUID } from "node:crypto";
import { generate } from "otplib";
import { AppwriteStore, storageId } from "../src/lib/appwrite-store";

test("archivio remoto Appwrite: privato, atomico e idempotente", async () => {
  const endpoint = process.env.APPWRITE_ENDPOINT!;
  const project = process.env.APPWRITE_PROJECT_ID!;
  const key = process.env.APPWRITE_API_KEY!;
  assert.ok(endpoint && project && key, "Configura Appwrite prima del test remoto");
  const client = new Client().setEndpoint(endpoint).setProject(project).setKey(key);
  const databaseId = process.env.APPWRITE_DATABASE_ID || "helpme";
  const store = new AppwriteStore(client, databaseId);
  const id = randomUUID();
  const second = randomUUID();
  try {
    await store.create("_verification", { id, value: 1 });
    assert.equal((await store.get("_verification", id))?.value, 1);
    await assert.rejects(store.create("_verification", { id, value: 2 }));
    const anonymous = new TablesDB(new Client().setEndpoint(endpoint).setProject(project));
    await assert.rejects(anonymous.getRow({ databaseId, tableId: "records", rowId: storageId("_verification", id) }));
    await assert.rejects(store.atomic(async tx => { await tx.update("_verification", id, { value: 8 }); await tx.create("_verification", { id: second, value: 9 }); throw new Error("Rollback intenzionale"); }, client));
    assert.equal((await store.get("_verification", id))?.value, 1);
    assert.equal(await store.get("_verification", second), null);
    await store.atomic(async tx => { await tx.update("_verification", id, { value: 3 }); await tx.create("_verification", { id: second, value: 4 }); }, client);
    assert.equal((await store.get("_verification", id))?.value, 3);
    assert.equal((await store.get("_verification", second))?.value, 4);
    const table = await new TablesDB(client).getTable({ databaseId, tableId: "records" });
    assert.deepEqual(table.$permissions, []);
    assert.equal(table.rowSecurity, true);
  } finally {
    if (await store.get("_verification", id)) await store.remove("_verification", id);
    if (await store.get("_verification", second)) await store.remove("_verification", second);
  }
});

test("Appwrite MFA: sessione iniziale bloccata e TOTP verificato", async () => {
  const client = new Client().setEndpoint(process.env.APPWRITE_ENDPOINT!).setProject(process.env.APPWRITE_PROJECT_ID!).setKey(process.env.APPWRITE_API_KEY!);
  const users = new Users(client);
  const id = "verify-" + randomBytes(10).toString("hex");
  const email = id + "@example.invalid";
  const password = randomBytes(24).toString("base64url");
  await users.create({ userId: id, email, password });
  try {
    await users.updateEmailVerification({ userId: id, emailVerification: true });
    const created = await new Account(client).createEmailPasswordSession({ email, password });
    assert.ok(created.secret);
    const account = new Account(new Client().setEndpoint(process.env.APPWRITE_ENDPOINT!).setProject(process.env.APPWRITE_PROJECT_ID!).setSession(created.secret));
    const enrollment = await account.createMFAAuthenticator({ type: AuthenticatorType.Totp });
    const code = await generate({ secret: enrollment.secret });
    await account.updateMFAAuthenticator({ type: AuthenticatorType.Totp, otp: code });
    await account.updateMFA({ mfa: true });
    const challenge = await account.createMFAChallenge({ factor: AuthenticationFactor.Totp });
    await account.updateMFAChallenge({ challengeId: challenge.$id, otp: code });
    const verified = await account.getSession({ sessionId: "current" });
    assert.ok(verified.factors.some(factor => factor.toLowerCase() === "totp"));
    assert.equal((await account.get()).mfa, true);
    const second = await new Account(client).createEmailPasswordSession({ email, password });
    const secondAccount = new Account(new Client().setEndpoint(process.env.APPWRITE_ENDPOINT!).setProject(process.env.APPWRITE_PROJECT_ID!).setSession(second.secret));
    await assert.rejects(secondAccount.get(), error => (error as { type?: string }).type === "user_more_factors_required");
    const current = (await users.listSessions({ userId: id })).sessions.find(item => item.$id === second.$id)!;
    assert.ok(!current.factors.includes("totp"));
    const nextChallenge = await secondAccount.createMFAChallenge({ factor: AuthenticationFactor.Totp });
    await secondAccount.updateMFAChallenge({ challengeId: nextChallenge.$id, otp: await generate({ secret: enrollment.secret }) });
    assert.equal((await secondAccount.get()).$id, id);
  } finally { await users.delete({ userId: id }); }
});
import { SignJWT, importPKCS8 } from "jose";

export async function createBankToken(appId: string, privateKey: string) {
  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "RS256");
  return new SignJWT({}).setProtectedHeader({ alg: "RS256", typ: "JWT", kid: appId })
    .setIssuer("enablebanking.com").setAudience("api.enablebanking.com").setIssuedAt().setExpirationTime("5m").sign(key);
}
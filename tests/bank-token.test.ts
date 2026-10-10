import { test } from "node:test";
import assert from "node:assert/strict";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { createBankToken } from "../src/lib/bank-token";

test("token conforme al contratto Enable Banking e firmato RS256", async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const pem = await exportPKCS8(keys.privateKey);
  const token = await createBankToken("app-test", pem.replace(/\n/g, "\\n"));
  const result = await jwtVerify(token, keys.publicKey, { issuer: "enablebanking.com", audience: "api.enablebanking.com" });
  assert.equal(result.protectedHeader.typ, "JWT");
  assert.equal(result.protectedHeader.alg, "RS256");
  assert.equal(result.protectedHeader.kid, "app-test");
  assert.equal(result.payload.exp! - result.payload.iat!, 300);
});
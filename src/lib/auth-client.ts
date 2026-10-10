"use client";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export async function authRequest(action: string, values: Record<string, unknown> = {}) {
  const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Operazione di accesso non riuscita");
  return result;
}
async function passkeyRequest(action: string, values: Record<string, unknown> = {}) {
  const response = await fetch("/api/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Operazione passkey non riuscita");
  return result;
}
export async function registerPasskey() {
  const options = await passkeyRequest("registerOptions");
  const response = await startRegistration({ optionsJSON: options });
  return passkeyRequest("registerVerify", { response });
}
export async function signInWithPasskey() {
  const options = await passkeyRequest("loginOptions");
  const response = await startAuthentication({ optionsJSON: options });
  return passkeyRequest("loginVerify", { response });
}
export const listPasskeys = () => passkeyRequest("list");
export const deletePasskey = (id: string) => passkeyRequest("delete", { id });
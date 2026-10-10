import { test } from "node:test";
import assert from "node:assert/strict";
import { localRegistrationAllowed, registrationEmail } from "../src/lib/registration-policy";

test("prima registrazione dall'app senza email preimpostata solo in sviluppo locale", () => {
  assert.equal(localRegistrationAllowed("development", "http://127.0.0.1:3000", "http://127.0.0.1:3000/api/registration"), true);
  assert.equal(registrationEmail("Nome@Example.invalid", undefined, true), "nome@example.invalid");
});
test("il primo visitatore del deploy pubblico non puo assegnarsi il proprietario", () => {
  assert.equal(localRegistrationAllowed("production", "http://localhost:3000", "http://localhost:3000/api/registration"), false);
  assert.equal(localRegistrationAllowed("development", "https://helpme.vercel.app", "https://helpme.vercel.app/api/registration"), false);
  assert.equal(localRegistrationAllowed("development", "http://localhost:3000", "http://localhost:3001/api/registration"), false);
  assert.equal(registrationEmail("altro@example.invalid", undefined, false), null);
});
test("email autorizzata esplicita non puo essere sostituita nemmeno in locale", () => {
  assert.equal(registrationEmail("altro@example.invalid", "proprietario@example.invalid", true), null);
  assert.equal(registrationEmail(" PROPRIETARIO@example.invalid ", "proprietario@example.invalid", false), "proprietario@example.invalid");
});
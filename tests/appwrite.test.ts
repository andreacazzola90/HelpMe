import { test } from "node:test";
import assert from "node:assert/strict";
import { storageId } from "../src/lib/appwrite-store";

test("identificativi Appwrite stabili e distinti tra entita", () => {
  assert.equal(storageId("transactions", "same"), storageId("transactions", "same"));
  assert.notEqual(storageId("transactions", "same"), storageId("bank_states", "same"));
  assert.match(storageId("categories", "Nome lungo con caratteri / non ammessi"), /^[a-f0-9]{36}$/);
});
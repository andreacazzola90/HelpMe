import { test, expect } from "@playwright/test";

const base = process.env.TEST_APP_URL || "http://127.0.0.1:3000";
for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`grafici, inserimento, CSV e categorie su ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/demo");
    await page.getByRole("combobox", { name: "Periodo", exact: true }).selectOption("6");
    await expect(page.locator(".recharts-area-curve")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/${viewport.name}.png`, fullPage: true });

    await page.getByRole("button", { name: "Aggiungi movimento", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Descrizione", { exact: true }).fill("Cena test browser");
    await dialog.getByLabel("Importo EUR", { exact: true }).fill("30,00");
    await dialog.getByLabel("Categoria", { exact: true }).selectOption("Ristoranti");
    await dialog.getByRole("button", { name: "Salva movimento", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.locator("nav").getByRole("button", { name: /Movimenti/ }).click();
    await page.getByRole("textbox", { name: "Cerca movimenti" }).fill("Cena test browser");
    await expect(page.locator("tbody")).toContainText("-30,00");
    await page.getByRole("button", { name: "Apri movimento Cena test browser", exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "Chiudi finestra", exact: true }).click();

    await page.getByRole("button", { name: "Importa CSV", exact: true }).click();
    await dialog.getByLabel("File CSV", { exact: true }).setInputFiles({ name: "sintetico.csv", mimeType: "text/csv", buffer: Buffer.from("Data;Descrizione;Importo\n10/10/2026;Esselunga CSV test;-25,00\n") });
    await dialog.getByRole("button", { name: "Conferma importazione", exact: true }).click();
    await page.getByRole("textbox", { name: "Cerca movimenti" }).fill("Esselunga CSV test");
    await expect(page.locator("tbody")).toContainText("-25,00");

    await page.locator("nav").getByRole("button", { name: "Categorie", exact: true }).click();
    const rename = page.locator("form").filter({ has: page.getByRole("button", { name: "Rinomina categoria", exact: true }) });
    await rename.getByRole("combobox").selectOption("Alimentari");
    await rename.getByRole("textbox", { name: "Nuovo nome", exact: true }).fill("Spesa alimentare");
    await rename.getByRole("button", { name: "Rinomina categoria", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Categoria rinominata");
    await page.locator("nav").getByRole("button", { name: /Movimenti/ }).click();
    if (viewport.name === "desktop") await expect(page.locator("tbody")).toContainText("Spesa alimentare");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("sessione assente non espone dati reali", async ({ page, request }) => {
  await page.route("**/api/auth", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ step: "login", configured: false }) }));
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "Bentornato" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accedi", exact: true })).toBeDisabled();
  const response = await request.get(base + "/api/data");
  expect([401,503]).toContain(response.status());
  expect((await response.json()).transactions).toBeUndefined();
});

test("creazione account personale raggiungibile dal login", async ({ page }) => {
  await page.route("**/api/auth", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ step: "login", configured: true }) }));
  await page.route("**/api/registration", route => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ message: "Se l'email e autorizzata, riceverai una conferma per il tuo account personale." }) }));
  await page.goto(base);
  await page.getByRole("button", { name: "Crea account personale", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Crea il tuo account", exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("proprietario@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password-sintetica");
  await page.getByLabel("Conferma password", { exact: true }).fill("test-password-sintetica");
  await page.getByRole("button", { name: "Crea account", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("riceverai una conferma");
  await page.getByRole("button", { name: "Torna al login", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bentornato", exact: true })).toBeVisible();
});

test("registrazione incompleta non crea account", async ({ request }) => {
  const response = await request.post(base + "/api/registration", { headers: { Origin: base }, data: { email: "proprietario@example.invalid" } });
  expect(response.status()).toBe(400);
});

test("registrazione completata prosegue nella conferma email", async ({ page }) => {
  await page.route("**/api/auth", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ step: "login", configured: true }) }));
  await page.route("**/api/registration", route => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ created: true, message: "Account creato. Controlla la tua email per confermare la registrazione." }) }));
  await page.goto(base);
  await page.getByRole("button", { name: "Crea account personale", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("proprietario@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password-sintetica");
  await page.getByLabel("Conferma password", { exact: true }).fill("test-password-sintetica");
  await page.getByRole("button", { name: "Crea account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conferma la tua email", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reinvia conferma", exact: true })).toBeVisible();
});

test("link conferma incompleto non autentica un utente", async ({ request }) => {
  const response = await request.get(base + "/auth/confirm?type=invite");
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: "Conferma non valida o incompleta" });
});

test("password non sufficienti: il login prosegue nel secondo fattore", async ({ page }) => {
  let loggedIn = false;
  await page.route("**/api/auth", async route => {
    if (route.request().method() === "GET") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ step: loggedIn ? "mfa" : "login", configured: true }) });
    const action = route.request().postDataJSON().action;
    if (action === "login") loggedIn = true;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(action === "challenge" ? { challengeId: "test-challenge" } : { ok: true }) });
  });
  await page.goto(base);
  await page.getByLabel("Email", { exact: true }).fill("proprietario@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password-sintetica");
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verifica il tuo accesso", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Panoramica", exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Codice Authenticator", { exact: true })).toBeVisible();
});

test("cookie inventato e origine estranea non aggirano l'accesso", async ({ request }) => {
  const auth = await request.get(base + "/api/data", { headers: { Cookie: "a_session_falso=session-inventata" } });
  expect([401,503]).toContain(auth.status());
  const origin = await request.post(base + "/api/auth", { headers: { Origin: "https://estraneo.example.invalid" }, data: { action: "logout" } });
  expect(origin.status()).toBe(403);
});
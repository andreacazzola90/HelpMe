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

test("servizi non configurati non espongono dati reali", async ({ page, request }) => {
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "Bentornato" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accedi", exact: true })).toBeDisabled();
  const response = await request.get(base + "/api/data");
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: "Configurazione del servizio incompleta" });
});
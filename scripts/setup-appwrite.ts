import { Client, TablesDB, TablesDBIndexType } from "node-appwrite";
import { AppwriteStore } from "../src/lib/appwrite-store";
import { categories, colors, defaultRules } from "../src/lib/finance";

const needed = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Variabile mancante: ${name}`); return value; };
const client = new Client().setEndpoint(needed("APPWRITE_ENDPOINT")).setProject(needed("APPWRITE_PROJECT_ID")).setKey(needed("APPWRITE_API_KEY"));
const tables = new TablesDB(client);
const databaseId = process.env.APPWRITE_DATABASE_ID || "helpme";
const tableId = "records";
async function createIfMissing(operation: () => Promise<unknown>) {
  try { await operation(); } catch (error) { if ((error as { code?: number }).code !== 409) throw error; }
}

async function setup() {
try {
  try { await tables.get({ databaseId }); }
  catch (error) { if ((error as { code?: number }).code !== 404) throw error; await tables.create({ databaseId, name: "HelpMe finanze personali" }); }
  try { await tables.getTable({ databaseId, tableId }); }
  catch (error) { if ((error as { code?: number }).code !== 404) throw error; await tables.createTable({ databaseId, tableId, name: "Archivio privato", permissions: [], rowSecurity: true }); }
  await createIfMissing(() => tables.createVarcharColumn({ databaseId, tableId, key: "entity", size: 64, required: true }));
  await createIfMissing(() => tables.createTextColumn({ databaseId, tableId, key: "payload", required: true }));
  const table = await tables.getTable({ databaseId, tableId });
  const columns = table.columns as { key: string; status: string }[];
  if (columns.some(column => ["entity", "payload"].includes(column.key) && column.status !== "available")) {
    console.log("Schema creato. Le colonne sono ancora in preparazione: riesegui il comando quando sono disponibili.");
  } else {
    await createIfMissing(() => tables.createIndex({ databaseId, tableId, key: "entity", type: TablesDBIndexType.Key, columns: ["entity"] }));
    const store = new AppwriteStore(client, databaseId);
    for (const [index, name] of categories.entries()) if (!await store.get("categories", name)) await store.create("categories", { id: name, name, color: colors[index % colors.length] });
    for (const rule of defaultRules) if (!await store.get("rules", rule.id)) await store.create("rules", rule);
    console.log("Archivio Appwrite pronto: categorie e regole iniziali disponibili. Nessun permesso client sui dati.");
  }
} catch (error) {
  console.error("Configurazione Appwrite non riuscita:", (error as { type?: string }).type || "errore di configurazione");
  process.exitCode = 1;
}
}
void setup();
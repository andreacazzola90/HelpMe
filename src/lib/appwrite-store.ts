import { createHash, randomUUID } from "node:crypto";
import { Query, TablesDB, type Client } from "node-appwrite";

export type RecordData = Record<string, unknown> & { id: string };
export const storageId = (entity: string, id: string) => createHash("sha256").update(JSON.stringify([entity, id])).digest("hex").slice(0, 36);
export class AppwriteStore {
  private tables: TablesDB;
  constructor(client: Client, private databaseId: string, private tableId = "records", private transactionId?: string) { this.tables = new TablesDB(client); }
  private params() { return { databaseId: this.databaseId, tableId: this.tableId, transactionId: this.transactionId }; }
  async list<T extends RecordData = RecordData>(entity: string): Promise<T[]> {
    const records: T[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.tables.listRows({ ...this.params(), queries: [Query.equal("entity", entity), Query.limit(100), Query.orderAsc("$id"), ...(cursor ? [Query.cursorAfter(cursor)] : [])] });
      for (const row of result.rows) records.push(JSON.parse(row.payload) as T);
      if (records.length > 50000) throw new Error("Storico oltre il limite della prima versione");
      cursor = result.rows.length === 100 ? result.rows.at(-1)?.$id : undefined;
    } while (cursor);
    return records;
  }
  async get<T extends RecordData = RecordData>(entity: string, id: string): Promise<T | null> {
    try { const row = await this.tables.getRow({ ...this.params(), rowId: storageId(entity, id) }); return JSON.parse(row.payload) as T; }
    catch (error) { if ((error as { code?: number }).code === 404) return null; throw error; }
  }
  async create<T extends RecordData>(entity: string, record: T) {
    await this.tables.createRow({ ...this.params(), rowId: storageId(entity, record.id), data: { entity, payload: JSON.stringify(record) }, permissions: [] });
    return record;
  }
  async update<T extends RecordData>(entity: string, id: string, changes: Partial<T>) {
    const current = await this.get<T>(entity, id);
    if (!current) throw new Error("Registrazione non trovata");
    const record = { ...current, ...changes, id };
    await this.tables.updateRow({ ...this.params(), rowId: storageId(entity, id), data: { payload: JSON.stringify(record) } });
    return record;
  }
  async put<T extends RecordData>(entity: string, record: T) {
    await this.tables.upsertRow({ ...this.params(), rowId: storageId(entity, record.id), data: { entity, payload: JSON.stringify(record) }, permissions: [] });
    return record;
  }
  async remove(entity: string, id: string) { await this.tables.deleteRow({ ...this.params(), rowId: storageId(entity, id) }); }
  async atomic<T>(operation: (store: AppwriteStore) => Promise<T>, client: Client) {
    if (this.transactionId) return operation(this);
    const transaction = await this.tables.createTransaction({ ttl: 300 });
    try {
      const value = await operation(new AppwriteStore(client, this.databaseId, this.tableId, transaction.$id));
      await this.tables.updateTransaction({ transactionId: transaction.$id, commit: true });
      return value;
    } catch (error) {
      await this.tables.updateTransaction({ transactionId: transaction.$id, rollback: true }).catch(() => undefined);
      throw error;
    }
  }
}
export const recordId = () => randomUUID();
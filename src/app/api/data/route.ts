import { failure, HttpError, readBody, requireOwner, verifyOrigin } from "@/lib/server";
import { dataAction, performDataAction, type StoredTransaction } from "@/lib/data-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    const { db, user } = await requireOwner();
    const [all, rules, categories, coverage, connections] = await Promise.all([db.list<StoredTransaction>("transactions"), db.list("rules"), db.list("categories"), db.list("coverage"), db.list("bank_connections")]);
    const transactions = all.filter(row => row.user_id === user.id).map(({ id, account_key, date, description, amount_cents, currency, kind, category, source, reconciled_to, refund_of }) => ({ id, account_key, date, description, amount_cents, currency, kind, category, source, reconciled_to, refund_of }));
    const bank = connections.map(({ account_key, valid_until, balance, synced_at, last_error }) => ({ account_key, valid_until, balance, synced_at, last_error }));
    return Response.json({ transactions, rules, categories, coverage, bank }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const { user } = await requireOwner();
    const parsed = dataAction.safeParse(await readBody(request));
    if (!parsed.success) throw new HttpError(400, "Campi non validi");
    return Response.json(await performDataAction(parsed.data, user.id));
  } catch (error) { return failure(error); }
}
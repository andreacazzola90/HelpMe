import { timingSafeEqual } from "node:crypto";
import { syncBank } from "@/lib/banking";
import { failure, HttpError, ownerId, required } from "@/lib/server";

export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const actual = Buffer.from(request.headers.get("authorization") || "");
    const expected = Buffer.from("Bearer " + required("CRON_SECRET"));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new HttpError(401, "Non autorizzato");
    return Response.json({ inserted: await syncBank(await ownerId()) });
  } catch (error) { return failure(error); }
}
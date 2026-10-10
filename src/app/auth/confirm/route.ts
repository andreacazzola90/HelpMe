import { NextResponse } from "next/server";
import { Account } from "node-appwrite";
import { appUrl, appwriteClient, failure, HttpError, ownerId } from "@/lib/server";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const secret = params.get("secret"); const userId = params.get("userId");
    if (!userId || !secret || secret.length > 1000) throw new HttpError(400, "Conferma non valida o incompleta");
    if (userId !== await ownerId()) throw new HttpError(400, "Conferma non valida");
    await new Account(appwriteClient()).updateVerification({ userId, secret });
    return NextResponse.redirect(appUrl() + "/?email=confirmed");
  } catch (error) { return failure(error); }
}
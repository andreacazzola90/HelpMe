"use client";

import { createBrowserClient } from "@supabase/ssr";

export function browserDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key, { auth: { experimental: { passkey: true } } });
}
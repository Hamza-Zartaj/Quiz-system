"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { LooseDatabase } from "./types";

export const createSupabaseBrowserClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase browser environment variables are not configured.");
  }

  return createBrowserClient<LooseDatabase>(url, anonKey);
};

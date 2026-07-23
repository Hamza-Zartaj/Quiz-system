import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LooseDatabase } from "./types";

let cachedClient: SupabaseClient<LooseDatabase> | null = null;

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

export const supabaseAdmin = () => {
  if (cachedClient) return cachedClient;

  cachedClient = createClient<LooseDatabase>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  return cachedClient;
};

import { createServerClient } from "@supabase/ssr";
import type { LooseDatabase } from "./types";
import { cookies } from "next/headers";

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies();

  return createServerClient<LooseDatabase>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server components cannot always set cookies. Route handlers can.
          }
        }
      }
    }
  );
};

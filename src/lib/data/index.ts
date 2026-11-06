import { createLocalBackend } from "./local";
import { createSupabaseBackend } from "./supabase";
import type { Backend } from "./types";

export * from "./types";

let instance: Backend | null = null;

/**
 * Supabase when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are
 * set; otherwise the in-browser demo store. Same interface either way.
 */
export function getBackend(): Backend {
  if (instance) return instance;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  instance = url && key ? createSupabaseBackend(url, key) : createLocalBackend();
  return instance;
}

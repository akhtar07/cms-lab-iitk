import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;

/** Browser-side Supabase client (singleton). */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(url ?? "https://not-configured.supabase.co", anon ?? "anon", {
      auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
    });
  }
  return client;
}

/** Absolute URL for a route inside this app, honouring the GitHub Pages base path. */
export function appUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (typeof window === "undefined") return `${base}${path}`;
  return `${window.location.origin}${base}${path}`;
}

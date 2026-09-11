import { createClient } from "npm:@supabase/supabase-js@2";

export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export interface Caller {
  id: string;
  email: string;
  role: string;
  status: string;
}

/** Resolve the calling user from the Authorization header, or null. */
export async function getCaller(req: Request): Promise<Caller | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: p } = await admin
    .from("profiles")
    .select("id, email, role, status")
    .eq("id", data.user.id)
    .single();
  return p as Caller | null;
}

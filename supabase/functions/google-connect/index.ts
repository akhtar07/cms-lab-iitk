// PI-only: store the Google refresh token obtained during "Connect Calendar".
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, getCaller } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const caller = await getCaller(req);
    if (!caller || caller.role !== "pi" || caller.status !== "active") {
      return json({ error: "PI only" }, 403);
    }
    const { refresh_token } = await req.json();
    if (!refresh_token) return json({ error: "refresh_token missing" }, 400);

    const { error } = await admin.from("google_tokens").upsert({
      profile_id: caller.id,
      refresh_token,
      connected_at: new Date().toISOString(),
    });
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

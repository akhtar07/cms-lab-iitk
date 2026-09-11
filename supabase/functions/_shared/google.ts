// Minimal Google Calendar client using the PI's stored refresh token.
import { admin } from "./supabase.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

export async function accessTokenForPi(): Promise<{ token: string; calendarId: string; piId: string }> {
  // pi_id() is the single source of truth for "which PI" — with more than one
  // PI account, picking a different row here than the database does would put
  // events on the wrong calendar.
  const { data: piId } = await admin.rpc("pi_id");
  if (!piId) throw new Error("No active PI");

  const { data: tok } = await admin
    .from("google_tokens").select("refresh_token, calendar_id").eq("profile_id", piId).single();
  if (!tok) throw new Error("PI has not connected Google Calendar yet");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tok.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google token refresh failed: ${body.error_description ?? body.error}`);
  return { token: body.access_token, calendarId: tok.calendar_id, piId };
}

export async function gcal(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${body.error?.message ?? JSON.stringify(body)}`);
  return body;
}

// Create / cancel Google Calendar events (with Meet links) for meetings, and
// pull the PI's busy times into availability_blocks.
//
//   POST { action: "create", meeting_id }     requester or PI
//   POST { action: "cancel", meeting_id }     requester or PI
//   POST { action: "sync_busy", days? }       PI, or cron with x-cron-secret
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, getCaller } from "../_shared/supabase.ts";
import { accessTokenForPi, gcal } from "../_shared/google.ts";

const TYPE_LABEL: Record<string, string> = {
  progress: "Progress update",
  paper: "Paper discussion",
  thesis: "Thesis",
  urgent: "Urgent",
  other: "Meeting",
};

async function loadMeeting(id: string) {
  const { data, error } = await admin
    .from("meetings")
    .select("*, requester:profiles!meetings_requester_id_fkey(email, full_name), host:profiles!meetings_host_id_fkey(email, full_name)")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Meeting not found");
  return data;
}

async function createEvent(meetingId: string) {
  const m = await loadMeeting(meetingId);
  if (m.gcal_event_id) return { meet_link: m.meet_link, gcal_event_id: m.gcal_event_id };

  const { data: s } = await admin.from("lab_settings").select("timezone, lab_name").eq("id", 1).single();
  const { token, calendarId } = await accessTokenForPi();

  const online = m.mode === "online";
  const event: Record<string, unknown> = {
    summary: `${TYPE_LABEL[m.type] ?? "Meeting"} — ${m.requester.full_name ?? m.requester.email}`,
    description: `${s?.lab_name ?? "Lab"} meeting booked via the lab portal.\n\nAgenda:\n${m.agenda}`,
    start: { dateTime: m.start_at, timeZone: s?.timezone ?? "Asia/Kolkata" },
    end: { dateTime: m.end_at, timeZone: s?.timezone ?? "Asia/Kolkata" },
    attendees: [{ email: m.requester.email }],
    reminders: { useDefault: false, overrides: [{ method: "email", minutes: 24 * 60 }, { method: "popup", minutes: 30 }] },
    extendedProperties: { private: { lab_meeting_id: m.id } },
  };
  if (online) {
    event.conferenceData = {
      createRequest: { requestId: m.id, conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
  } else {
    event.location = m.location ?? undefined;
  }

  const created = await gcal(
    token,
    `calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    { method: "POST", body: JSON.stringify(event) },
  );

  const meet_link = created.hangoutLink ?? created.conferenceData?.entryPoints?.find((e: { entryPointType: string }) => e.entryPointType === "video")?.uri ?? null;
  await admin.from("meetings").update({ meet_link, gcal_event_id: created.id }).eq("id", m.id);
  return { meet_link, gcal_event_id: created.id };
}

async function cancelEvent(meetingId: string) {
  const m = await loadMeeting(meetingId);
  if (!m.gcal_event_id) return { ok: true, skipped: true };
  const { token, calendarId } = await accessTokenForPi();
  try {
    await gcal(token, `calendars/${encodeURIComponent(calendarId)}/events/${m.gcal_event_id}?sendUpdates=all`, { method: "DELETE" });
  } catch (e) {
    // Already deleted in Google — fine.
    if (!String((e as Error).message).includes("410") && !String((e as Error).message).includes("404")) throw e;
  }
  return { ok: true };
}

// Pull the PI's real calendar busy times so students cannot book over them.
async function syncBusy(days = 28) {
  const { token, calendarId } = await accessTokenForPi();
  const timeMin = new Date();
  const timeMax = new Date(Date.now() + days * 86400_000);

  const fb = await gcal(token, "freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: [{ id: calendarId }] }),
  });
  const busy: { start: string; end: string }[] = fb.calendars?.[calendarId]?.busy ?? [];

  // Events created by this portal are already meetings; drop them from busy
  // so we don't double-mark. Compare by exact time range.
  const { data: ours } = await admin.from("meetings").select("start_at, end_at").eq("status", "confirmed")
    .gte("start_at", timeMin.toISOString()).lte("start_at", timeMax.toISOString());
  const ourRanges = new Set((ours ?? []).map((m) => `${new Date(m.start_at).getTime()}-${new Date(m.end_at).getTime()}`));
  const rows = busy
    .filter((b) => !ourRanges.has(`${new Date(b.start).getTime()}-${new Date(b.end).getTime()}`))
    .map((b, i) => ({
      kind: "blocked",
      start_at: b.start,
      end_at: b.end,
      reason: "Busy (Google Calendar)",
      source: "gcal",
      gcal_id: `busy-${new Date(b.start).getTime()}-${i}`,
    }));

  await admin.from("availability_blocks").delete().eq("source", "gcal").gte("start_at", timeMin.toISOString());
  if (rows.length) {
    const { error } = await admin.from("availability_blocks").insert(rows);
    if (error) throw error;
  }
  return { ok: true, blocks: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const cronOk = !!Deno.env.get("CRON_SECRET") && req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET");
    const caller = cronOk ? null : await getCaller(req);
    const isPi = caller?.role === "pi" && caller.status === "active";

    switch (body.action) {
      case "create":
      case "cancel": {
        if (!caller) return json({ error: "Unauthorized" }, 401);
        const m = await loadMeeting(body.meeting_id);
        if (m.requester_id !== caller.id && !isPi) return json({ error: "Forbidden" }, 403);
        return json(body.action === "create" ? await createEvent(m.id) : await cancelEvent(m.id));
      }
      case "sync_busy": {
        if (!cronOk && !isPi) return json({ error: "PI only" }, 403);
        return json(await syncBusy(body.days ?? 28));
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

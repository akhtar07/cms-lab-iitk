// The lab agent. Reads the lab's own records (projects, notes, action items,
// weekly updates) and asks an LLM to brief, extract, digest, or answer.
//
//   POST { action: "brief",   meeting_id }              PI only
//   POST { action: "extract", meeting_id, raw_notes }   PI or the requester
//   POST { action: "digest" }                           PI, or cron with x-cron-secret
//   POST { action: "ask",     question, project_id? }   any active member (scoped)
//   POST { action: "status" }                           is an LLM key configured?
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, getCaller, type Caller } from "../_shared/supabase.ts";
import { chat, parseJson } from "../_shared/llm.ts";

const SYSTEM = `You are the research assistant of a computational materials science group (DFT, phonons, 2D materials, defects, ML potentials). Be concrete and terse. Use the lab's own records given to you; never invent results, dates or people. Write in plain Markdown with short headings and bullets. Dates are in the lab timezone (IST).`;

const day = (d: string | Date | null | undefined) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

/* ------------------------------------------------------------ context ---- */
async function profileMap() {
  const { data } = await admin.from("profiles").select("id, full_name, email, role").eq("status", "active");
  return new Map((data ?? []).map((p) => [p.id, p]));
}
const name = (m: Map<string, { full_name: string | null; email: string }>, id: string | null) =>
  id ? (m.get(id)?.full_name ?? m.get(id)?.email ?? "unknown") : "—";

/** Everything the lab knows about one person's research, as text. */
async function personContext(profileId: string, people: Awaited<ReturnType<typeof profileMap>>, sinceDays = 90) {
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const [{ data: memberships }, { data: items }, { data: updates }, { data: meetings }] = await Promise.all([
    admin.from("project_members").select("project_id, role, project:projects(*)").eq("profile_id", profileId),
    admin.from("action_items").select("*").eq("owner_id", profileId).order("created_at", { ascending: false }).limit(40),
    admin.from("weekly_updates").select("*, project:projects(title, short_code)").eq("author_id", profileId).gte("created_at", since).order("week_start", { ascending: false }).limit(12),
    admin.from("meetings").select("id, start_at, type, agenda, status, project_id, notes:meeting_notes(summary, decisions, next_focus)").eq("requester_id", profileId).gte("start_at", since).order("start_at", { ascending: false }).limit(15),
  ]);
  const out: string[] = [];
  const projects = (memberships ?? []).map((m) => m.project as unknown as Record<string, unknown>).filter(Boolean);
  out.push(`## Projects (${projects.length})`);
  for (const p of projects) {
    out.push(`- **${p.title}**${p.short_code ? ` [${p.short_code}]` : ""} — stage: ${p.stage}; last activity ${day(p.last_activity as string)}${p.target_journal ? `; target: ${p.target_journal}` : ""}${p.revision_due ? `; revision due ${day(p.revision_due as string)}` : ""}${p.summary ? `\n  ${p.summary}` : ""}`);
  }
  const open = (items ?? []).filter((i) => i.status === "open");
  const done = (items ?? []).filter((i) => i.status === "done").slice(0, 10);
  out.push(`\n## Open action items (${open.length})`);
  for (const i of open) out.push(`- ${i.title}${i.due_on ? ` (due ${day(i.due_on)}${new Date(i.due_on) < new Date() ? ", OVERDUE" : ""})` : ""} — created ${day(i.created_at)}`);
  if (done.length) { out.push(`\n## Recently completed`); for (const i of done) out.push(`- ${i.title} (done ${day(i.done_at)})`); }
  out.push(`\n## Weekly updates (newest first)`);
  for (const u of updates ?? []) {
    const proj = u.project as unknown as { title: string } | null;
    out.push(`- Week of ${day(u.week_start)}${proj ? ` · ${proj.title}` : ""}\n  did: ${u.did ?? "—"}\n  blocked: ${u.blocked ?? "—"}\n  next: ${u.next ?? "—"}`);
  }
  out.push(`\n## Meetings with the PI (newest first)`);
  for (const m of meetings ?? []) {
    const n = (m.notes as unknown as { summary: string | null; decisions: string[] | null; next_focus: string | null }[] | null)?.[0];
    out.push(`- ${day(m.start_at)} · ${m.type} · ${m.status}\n  agenda: ${m.agenda}` + (n?.summary ? `\n  summary: ${n.summary}` : "") + (n?.decisions?.length ? `\n  decisions: ${n.decisions.join("; ")}` : "") + (n?.next_focus ? `\n  next focus: ${n.next_focus}` : ""));
  }
  return out.join("\n");
}

/** Whole-lab context for the PI: every active member, compact. */
async function labContext(people: Awaited<ReturnType<typeof profileMap>>) {
  const members = [...people.values()].filter((p) => p.role !== "pi");
  const parts: string[] = [];
  for (const p of members) parts.push(`# ${p.full_name ?? p.email} (${p.role})\n` + await personContext(p.id, people, 45));
  const { data: stale } = await admin.from("projects").select("title, stage, last_activity, lead_id")
    .not("stage", "in", "(published,shelved)").lt("last_activity", new Date(Date.now() - 14 * 86400_000).toISOString());
  if (stale?.length) {
    parts.push(`# Stale projects (no activity ≥14 days)\n` + stale.map((s) => `- ${s.title} (${s.stage}) — lead ${name(people, s.lead_id)}, last activity ${day(s.last_activity)}`).join("\n"));
  }
  return parts.join("\n\n");
}

/* ------------------------------------------------------------- actions ---- */
async function brief(caller: Caller, meetingId: string) {
  if (caller.role !== "pi") throw new Error("Only the PI can generate briefs.");
  const { data: m } = await admin.from("meetings").select("*, requester:profiles!meetings_requester_id_fkey(id, full_name, email, role)").eq("id", meetingId).single();
  if (!m) throw new Error("Meeting not found");
  const people = await profileMap();
  const ctx = await personContext(m.requester.id, people);
  const text = await chat({
    system: SYSTEM,
    user: `Prepare a 1-minute pre-meeting brief for the PI.

Meeting: ${day(m.start_at)} · ${m.type} · agenda: "${m.agenda}"
Student: ${m.requester.full_name ?? m.requester.email} (${m.requester.role})

Their records:
${ctx}

Write: (1) where they are (2 lines), (2) what was decided last time and whether it got done, (3) overdue or blocked items, (4) 3 sharp questions the PI should ask. Under 200 words.`,
  });
  await admin.from("meetings").update({ pi_brief: text, brief_generated_at: new Date().toISOString() }).eq("id", meetingId);
  return { brief: text };
}

interface Extracted { summary: string; decisions: string[]; next_focus: string; action_items: { title: string; owner: "student" | "pi"; due_in_days?: number | null }[] }

async function extract(caller: Caller, meetingId: string, rawNotes: string) {
  const { data: m } = await admin.from("meetings").select("id, requester_id, host_id, agenda, type, start_at, project_id").eq("id", meetingId).single();
  if (!m) throw new Error("Meeting not found");
  if (caller.role !== "pi" && caller.id !== m.requester_id) throw new Error("Not your meeting.");
  const text = await chat({
    system: SYSTEM,
    json: true,
    user: `Meeting notes from a ${m.type} meeting on ${day(m.start_at)}. Agenda: "${m.agenda}".

NOTES:
${rawNotes}

Return JSON: {"summary": string (≤80 words), "decisions": string[] (concrete decisions, ≤6), "next_focus": string (one sentence: what the student works on next), "action_items": [{"title": string, "owner": "student"|"pi", "due_in_days": number|null}]}. Only include action items that are explicitly stated or clearly implied. Titles start with a verb.`,
    maxTokens: 1500,
  });
  const out = parseJson<Extracted>(text);
  const note = {
    meeting_id: meetingId, author_id: caller.id, raw_notes: rawNotes,
    summary: out.summary, decisions: out.decisions ?? [], next_focus: out.next_focus ?? null,
    extracted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const { data: saved, error } = await admin.from("meeting_notes").upsert(note, { onConflict: "meeting_id" }).select().single();
  if (error) throw error;
  const items = (out.action_items ?? []).map((a) => ({
    meeting_id: meetingId, project_id: m.project_id, created_by: caller.id,
    owner_id: a.owner === "pi" ? m.host_id : m.requester_id, title: a.title,
    due_on: a.due_in_days ? new Date(Date.now() + a.due_in_days * 86400_000).toISOString().slice(0, 10) : null,
  }));
  if (items.length) await admin.from("action_items").insert(items);
  await admin.from("meetings").update({ status: "completed" }).eq("id", meetingId).eq("status", "confirmed");
  return { note: saved, action_items: items.length };
}

async function digest() {
  const people = await profileMap();
  const ctx = await labContext(people);
  const text = await chat({
    system: SYSTEM,
    user: `Write the weekly "state of the lab" digest for the PI, dated ${day(new Date())}.

${ctx}

Structure: **Needs attention** (people with overdue items, blockers, no weekly update, stale projects — name names), **Progress this week** (one line per person), **Papers pipeline** (submitted/review/revision with dates), **Suggested follow-ups** (3–5 bullets). Under 450 words.`,
    maxTokens: 2500,
  });
  const { data } = await admin.from("digests").insert({ kind: "weekly", content: text }).select().single();
  return { digest: data };
}

async function ask(caller: Caller, question: string, projectId?: string) {
  const people = await profileMap();
  let ctx: string;
  if (caller.role === "pi") ctx = await labContext(people);
  else if (projectId) {
    const { data: pm } = await admin.from("project_members").select("profile_id").eq("project_id", projectId);
    if (!pm?.some((x) => x.profile_id === caller.id)) throw new Error("You are not on that project.");
    ctx = (await Promise.all(pm.map(async (x) => `# ${name(people, x.profile_id)}\n` + await personContext(x.profile_id, people)))).join("\n\n");
  } else ctx = await personContext(caller.id, people);

  const text = await chat({
    system: SYSTEM + (caller.role === "pi" ? "" : " You are talking to a student; only their own projects are visible to you."),
    user: `Lab records:\n${ctx}\n\nToday is ${day(new Date())}. Question from ${name(people, caller.id)}: ${question}\n\nAnswer from the records above. If the records don't say, say so.`,
  });
  await admin.from("agent_queries").insert({ asked_by: caller.id, question, answer: text });
  return { answer: text };
}

/* ------------------------------------------------------------- handler ---- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const cronOk = !!Deno.env.get("CRON_SECRET") && req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET");
    if (body.action === "digest" && cronOk) return json(await digest());

    const caller = await getCaller(req);
    if (!caller || caller.status !== "active") return json({ error: "Not signed in or not approved." }, 401);

    switch (body.action) {
      case "status": return json({ configured: !!(Deno.env.get("GEMINI_API_KEY") || Deno.env.get("LLM_API_KEY")), provider: Deno.env.get("LLM_PROVIDER") ?? "gemini" });
      case "brief":   return json(await brief(caller, body.meeting_id));
      case "extract": return json(await extract(caller, body.meeting_id, String(body.raw_notes ?? "")));
      case "digest":  if (caller.role !== "pi") return json({ error: "PI only" }, 403); return json(await digest());
      case "ask":     return json(await ask(caller, String(body.question ?? "").slice(0, 2000), body.project_id));
      default:        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

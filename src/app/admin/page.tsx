"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, X, Plus, Trash2, RefreshCw, Link2, UserCheck, Sparkles, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { callFn, announceSlotsChanged } from "@/lib/functions";
import { fmtDateTime, fmtDate, fmtTime } from "@/lib/format";
import { ROLE_LABEL, ROLE_ORDER, WEEKDAYS, type AvailabilityBlock, type AvailabilityRule, type LabSettings, type MemberRole, type Profile } from "@/lib/types";

type Tab = "approvals" | "availability" | "calendar" | "assistant" | "members" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "approvals", label: "Approvals" },
  { id: "availability", label: "Availability" },
  { id: "calendar", label: "Google Calendar" },
  { id: "assistant", label: "Lab assistant" },
  { id: "members", label: "Members" },
  { id: "settings", label: "Settings" },
];

export default function AdminPage() {
  return <AppShell requirePi><Suspense fallback={<Spinner />}><Admin /></Suspense></AppShell>;
}

function Admin() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "approvals");
  const toast = useToast();
  useEffect(() => { if (params.get("connected")) { setTab("calendar"); toast("Google Calendar connected.", "success"); } }, [params, toast]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted">Approvals, office hours, and calendar link.</p>
      </div>
      <div className="scroll-thin mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? "border-accent text-accent-text" : "border-transparent text-muted hover:text-text"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "approvals" && <Approvals />}
      {tab === "availability" && <Availability />}
      {tab === "calendar" && <Calendar />}
      {tab === "assistant" && <AssistantSetup />}
      {tab === "members" && <Members />}
      {tab === "settings" && <Settings />}
    </>
  );
}

/* -------------------------------------------------------- Assistant setup */
function AssistantSetup() {
  const [state, setState] = useState<{ configured: boolean; provider: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    callFn<{ configured: boolean; provider: string }>("agent", { action: "status" })
      .then(setState).catch((e) => setErr((e as Error).message));
  }, []);
  return (
    <Card>
      <CardHeader title="Lab assistant" subtitle="Reads your lab's own records to brief you before meetings, turn notes into action items, and write the Friday digest." />
      <div className="space-y-4 px-5 pb-5 text-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          {err ? <Badge tone="danger">Function error: {err}</Badge>
            : state === null ? <span className="text-muted">Checking…</span>
            : state.configured ? <Badge tone="success">Connected via {state.provider}</Badge>
            : <Badge tone="warn">No AI key set</Badge>}
        </div>
        {state && !state.configured && (
          <ol className="list-decimal space-y-2 pl-5 text-muted">
            <li>Get a free API key at <a className="text-accent-text hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey <ExternalLink className="inline h-3 w-3" /></a> — Google&apos;s free tier is enough for a lab this size.</li>
            <li>Open <a className="text-accent-text hover:underline" href="https://supabase.com/dashboard/project/_/settings/functions" target="_blank" rel="noreferrer">Supabase → Edge Functions → Secrets</a>.</li>
            <li>Add a secret named <code className="rounded bg-surface-2 px-1 font-mono text-[12px]">GEMINI_API_KEY</code> with that value, then reload this page.</li>
          </ol>
        )}
        <p className="text-muted">
          Want a different model? Set <code className="rounded bg-surface-2 px-1 font-mono text-[12px]">LLM_PROVIDER=openai</code> plus
          {" "}<code className="rounded bg-surface-2 px-1 font-mono text-[12px]">LLM_BASE_URL</code>,
          {" "}<code className="rounded bg-surface-2 px-1 font-mono text-[12px]">LLM_API_KEY</code> and
          {" "}<code className="rounded bg-surface-2 px-1 font-mono text-[12px]">LLM_MODEL</code> — any OpenAI-compatible endpoint (Groq, OpenRouter, a local model) works.
        </p>
        <p className="text-muted">Nothing leaves Supabase except the text of the prompt sent to the model provider. No student data is stored with them.</p>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- Approvals */
function Approvals() {
  const toast = useToast();
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [choice, setChoice] = useState<Record<string, { role: MemberRole; mentor: string }>>({});

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: p }, { data: m }] = await Promise.all([
      sb.from("profiles").select("*").eq("status", "pending").order("created_at"),
      sb.from("profiles").select("*").eq("status", "active").order("full_name"),
    ]);
    setRows((p ?? []) as Profile[]); setMembers((m ?? []) as Profile[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (p: Profile, approve: boolean) => {
    const c = choice[p.id] ?? { role: p.requested_role ?? "phd", mentor: "" };
    const { error } = await supabase().rpc("review_member", { p_id: p.id, p_approve: approve, p_role: c.role, p_mentor: c.mentor || null });
    if (error) toast(error.message, "danger"); else { toast(approve ? `${p.full_name ?? p.email} approved.` : "Request rejected.", "success"); load(); }
  };

  if (!rows) return <Spinner />;
  if (rows.length === 0) return <Card><EmptyState icon={<UserCheck className="h-8 w-8" />} title="No pending requests" body="New sign-ups will show up here for approval." /></Card>;

  return (
    <div className="space-y-3">
      {rows.map((p) => {
        const c = choice[p.id] ?? { role: p.requested_role ?? "phd", mentor: "" };
        const set = (patch: Partial<typeof c>) => setChoice((s) => ({ ...s, [p.id]: { ...c, ...patch } }));
        return (
          <Card key={p.id} className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar src={p.avatar_url} name={p.full_name} email={p.email} size={44} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.full_name ?? "(no name)"}</p>
                <p className="text-sm text-muted">{p.email} · requested {fmtDate(p.created_at)}</p>
                {p.requested_role && <Badge tone="accent" className="mt-1">Asked for: {ROLE_LABEL[p.requested_role]}</Badge>}
              </div>
              <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
                <Select value={c.role} onChange={(e) => set({ role: e.target.value as MemberRole })}>
                  {ROLE_ORDER.filter((r) => r !== "pi").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
                <Select value={c.mentor} onChange={(e) => set({ mentor: e.target.value })}>
                  <option value="">No mentor</option>
                  {members.filter((m) => m.role !== "ugp" && m.role !== "intern").map((m) => <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>)}
                </Select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => review(p, true)}><Check className="h-4 w-4" /> Approve</Button>
                <Button size="sm" variant="danger" onClick={() => review(p, false)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ Availability */
function Availability() {
  const toast = useToast();
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [nr, setNr] = useState({ weekday: 2, start_time: "15:00", end_time: "17:00", slot_minutes: 20, mode: "both", location: "" });
  const [nb, setNb] = useState({ kind: "blocked", start: "", end: "", reason: "" });

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: r }, { data: b }] = await Promise.all([
      sb.from("availability_rules").select("*").order("weekday").order("start_time"),
      sb.from("availability_blocks").select("*").gte("end_at", new Date().toISOString()).order("start_at"),
    ]);
    setRules((r ?? []) as AvailabilityRule[]); setBlocks((b ?? []) as AvailabilityBlock[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const addRule = async () => {
    const { error } = await supabase().from("availability_rules").insert({ ...nr, location: nr.location || null });
    if (error) toast(error.message, "danger"); else { toast("Office hours added.", "success"); load(); announceSlotsChanged().catch(() => {}); }
  };
  const toggleRule = async (r: AvailabilityRule) => {
    await supabase().from("availability_rules").update({ active: !r.active }).eq("id", r.id); load(); announceSlotsChanged().catch(() => {});
  };
  const delRule = async (id: string) => { await supabase().from("availability_rules").delete().eq("id", id); load(); announceSlotsChanged().catch(() => {}); };

  const addBlock = async () => {
    if (!nb.start || !nb.end) return;
    const { error } = await supabase().from("availability_blocks").insert({
      kind: nb.kind, start_at: new Date(nb.start).toISOString(), end_at: new Date(nb.end).toISOString(), reason: nb.reason || null,
    });
    if (error) toast(error.message, "danger"); else { setNb({ kind: "blocked", start: "", end: "", reason: "" }); load(); announceSlotsChanged().catch(() => {}); }
  };
  const delBlock = async (id: string) => { await supabase().from("availability_blocks").delete().eq("id", id); load(); announceSlotsChanged().catch(() => {}); };

  if (!rules) return <Spinner />;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Weekly office hours" subtitle="Students can only book inside these windows, on the slot grid." />
        <div className="px-5 pb-5">
          {rules.length === 0 && <p className="mb-4 text-sm text-muted">No office hours yet — add your first window below.</p>}
          <ul className="divide-y divide-line">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="w-10 font-medium">{WEEKDAYS[r.weekday]}</span>
                <span>{r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}</span>
                <Badge>{r.slot_minutes} min</Badge>
                <Badge tone="accent">{r.mode}</Badge>
                {r.location && <span className="text-muted">{r.location}</span>}
                <span className="flex-1" />
                <button onClick={() => toggleRule(r)} className={`text-xs font-medium ${r.active ? "text-success" : "text-muted"}`}>{r.active ? "Active" : "Paused"}</button>
                <button onClick={() => delRule(r.id)} className="text-muted hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3 rounded-lg bg-surface-2 p-4 sm:grid-cols-6">
            <Field label="Day"><Select value={nr.weekday} onChange={(e) => setNr({ ...nr, weekday: +e.target.value })}>{WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</Select></Field>
            <Field label="From"><Input type="time" value={nr.start_time} onChange={(e) => setNr({ ...nr, start_time: e.target.value })} /></Field>
            <Field label="To"><Input type="time" value={nr.end_time} onChange={(e) => setNr({ ...nr, end_time: e.target.value })} /></Field>
            <Field label="Slot (min)"><Input type="number" min={5} max={240} step={5} value={nr.slot_minutes} onChange={(e) => setNr({ ...nr, slot_minutes: +e.target.value })} /></Field>
            <Field label="Mode"><Select value={nr.mode} onChange={(e) => setNr({ ...nr, mode: e.target.value })}><option value="both">Both</option><option value="online">Online only</option><option value="offline">In person only</option></Select></Field>
            <Field label="Room"><Input value={nr.location} onChange={(e) => setNr({ ...nr, location: e.target.value })} placeholder="e.g. FB-421" /></Field>
            <div className="sm:col-span-6"><Button size="sm" onClick={addRule}><Plus className="h-4 w-4" /> Add window</Button></div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Exceptions" subtitle="Block time off (travel, leave) or open a one-off window outside office hours. Google Calendar busy times appear here after a sync." />
        <div className="px-5 pb-5">
          <ul className="divide-y divide-line">
            {blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <Badge tone={b.kind === "blocked" ? "warn" : "success"}>{b.kind}</Badge>
                <span>{fmtDateTime(b.start_at)} → {fmtDate(b.end_at)} {fmtTime(b.end_at)}</span>
                <span className="text-muted">{b.reason}</span>
                {b.source === "gcal" && <Badge>from Google</Badge>}
                <span className="flex-1" />
                {b.source !== "gcal" && <button onClick={() => delBlock(b.id)} className="text-muted hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}
            {blocks.length === 0 && <li className="py-3 text-sm text-muted">No upcoming exceptions.</li>}
          </ul>
          <div className="mt-4 grid gap-3 rounded-lg bg-surface-2 p-4 sm:grid-cols-4">
            <Field label="Type"><Select value={nb.kind} onChange={(e) => setNb({ ...nb, kind: e.target.value })}><option value="blocked">Blocked (unavailable)</option><option value="open">Extra open window</option></Select></Field>
            <Field label="From"><Input type="datetime-local" value={nb.start} onChange={(e) => setNb({ ...nb, start: e.target.value })} /></Field>
            <Field label="To"><Input type="datetime-local" value={nb.end} onChange={(e) => setNb({ ...nb, end: e.target.value })} /></Field>
            <Field label="Reason"><Input value={nb.reason} onChange={(e) => setNb({ ...nb, reason: e.target.value })} placeholder="Conference, leave…" /></Field>
            <div className="sm:col-span-4"><Button size="sm" onClick={addBlock}><Plus className="h-4 w-4" /> Add exception</Button></div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- Calendar */
function Calendar() {
  const { signIn } = useAuth();
  const toast = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const check = useCallback(async () => { const { data } = await supabase().rpc("calendar_connected"); setConnected(!!data); }, []);
  useEffect(() => { check(); }, [check]);

  const sync = async () => {
    setSyncing(true);
    try { const r = await callFn<{ blocks: number }>("calendar-sync", { action: "sync_busy", days: 28 }); toast(`Synced — ${r.blocks} busy block(s) imported.`, "success"); announceSlotsChanged().catch(() => {}); }
    catch (e) { toast((e as Error).message, "danger"); }
    setSyncing(false);
  };

  return (
    <Card>
      <CardHeader title="Google Calendar" subtitle="Bookings become events on your calendar with a Meet link; your busy times block the booking grid." />
      <div className="px-5 pb-5">
        {connected === null ? <Spinner /> : connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-success"><Check className="h-4 w-4" /> Connected. New bookings will be added to your primary calendar.</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={sync} loading={syncing}><RefreshCw className="h-4 w-4" /> Import busy times (next 28 days)</Button>
              <Button variant="ghost" onClick={() => signIn({ connectCalendar: true })}>Re-connect</Button>
            </div>
            <p className="text-xs text-muted">Tip: the GitHub Action in this repo can run the import automatically every few hours.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">You&apos;ll be sent to Google to grant calendar access once. Only you (the PI) ever do this — students don&apos;t need to.</p>
            <Button onClick={() => signIn({ connectCalendar: true })}><Link2 className="h-4 w-4" /> Connect Google Calendar</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- Members */
function Members() {
  const toast = useToast();
  const [rows, setRows] = useState<Profile[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase().from("profiles").select("*").neq("status", "pending").order("status").order("full_name");
    setRows((data ?? []) as Profile[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = async (id: string, patch: Partial<Profile>) => {
    const { error } = await supabase().from("profiles").update(patch).eq("id", id);
    if (error) toast(error.message, "danger"); else load();
  };
  if (!rows) return <Spinner />;
  return (
    <Card>
      <CardHeader title="Members" subtitle="Change roles, mark alumni, or revoke access." />
      <ul className="divide-y divide-line px-5 pb-3">
        {rows.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
            <Avatar src={p.avatar_url} name={p.full_name} email={p.email} size={32} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.full_name ?? p.email}</p><p className="truncate text-xs text-muted">{p.email}</p></div>
            <Select value={p.role} disabled={p.role === "pi"} onChange={(e) => update(p.id, { role: e.target.value as MemberRole })} className="w-44">
              {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
            <Select value={p.status} disabled={p.role === "pi"} onChange={(e) => update(p.id, { status: e.target.value as Profile["status"] })} className="w-32">
              <option value="active">Active</option><option value="left">Left</option><option value="rejected">Revoked</option>
            </Select>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- Settings */
function Settings() {
  const { settings, refresh } = useAuth();
  const toast = useToast();
  const [f, setF] = useState<Partial<LabSettings>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (settings) setF(settings); }, [settings]);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase().from("lab_settings").update({
      lab_name: f.lab_name, pi_display_name: f.pi_display_name, default_location: f.default_location, timezone: f.timezone,
      booking_horizon_days: f.booking_horizon_days, min_notice_hours: f.min_notice_hours, cancel_notice_hours: f.cancel_notice_hours,
    }).eq("id", 1);
    setSaving(false);
    if (error) toast(error.message, "danger"); else { toast("Settings saved.", "success"); refresh(); }
  };
  const num = (k: keyof LabSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: +e.target.value });
  const str = (k: keyof LabSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card>
      <CardHeader title="Lab settings" />
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
        <Field label="Lab name"><Input value={f.lab_name ?? ""} onChange={str("lab_name")} /></Field>
        <Field label="PI display name"><Input value={f.pi_display_name ?? ""} onChange={str("pi_display_name")} /></Field>
        <Field label="Default meeting room"><Input value={f.default_location ?? ""} onChange={str("default_location")} /></Field>
        <Field label="Timezone (IANA)"><Input value={f.timezone ?? ""} onChange={str("timezone")} /></Field>
        <Field label="Booking horizon (days)"><Input type="number" min={1} value={f.booking_horizon_days ?? 21} onChange={num("booking_horizon_days")} /></Field>
        <Field label="Minimum notice (hours)"><Input type="number" min={0} value={f.min_notice_hours ?? 12} onChange={num("min_notice_hours")} /></Field>
        <Field label="Late-cancel threshold (hours)"><Input type="number" min={0} value={f.cancel_notice_hours ?? 2} onChange={num("cancel_notice_hours")} /></Field>
        <div className="flex items-end sm:col-span-2"><Button onClick={save} loading={saving}>Save settings</Button></div>
      </div>
    </Card>
  );
}

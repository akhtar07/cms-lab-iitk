"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, ClipboardList } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Segmented, Spinner, Textarea, useToast } from "@/components/ui";
import { ProjectSelect } from "@/components/research";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { fmtDate, labStartOfWeek, labParts } from "@/lib/format";
import { ROLE_LABEL, type MemberRole, type Project, type WeeklyUpdate } from "@/lib/types";

export default function UpdatesPage() {
  return <AppShell><Suspense fallback={<Spinner />}><Updates /></Suspense></AppShell>;
}

/** YYYY-MM-DD of the Monday (lab time) for the week containing `d`. */
function weekKey(d: Date) { const p = labParts(labStartOfWeek(d)); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; }

function Updates() {
  const { isPi } = useAuth();
  const [view, setView] = useState<"mine" | "lab">(isPi ? "lab" : "mine");
  return (
    <>
      <PageHeader title="Weekly updates" subtitle="Two minutes every Friday: what you did, what's blocking you, what's next. The assistant reads these."
        action={isPi ? <Segmented value={view} onChange={setView} options={[{ value: "lab", label: "Whole lab" }, { value: "mine", label: "My updates" }]} /> : undefined} />
      {view === "lab" && isPi ? <LabView /> : <MyUpdates />}
    </>
  );
}

/* ------------------------------------------------------------ member ---- */
function MyUpdates() {
  const { profile } = useAuth();
  const toast = useToast();
  const preselect = useSearchParams().get("project") ?? "";
  const [week, setWeek] = useState(() => labStartOfWeek(new Date()));
  const [projects, setProjects] = useState<Pick<Project, "id" | "title" | "short_code">[]>([]);
  const [project, setProject] = useState(preselect);
  const [rows, setRows] = useState<WeeklyUpdate[] | null>(null);
  const [f, setF] = useState({ did: "", blocked: "", next: "", hours: "" });
  const [busy, setBusy] = useState(false);
  const wk = weekKey(week);
  const thisWeek = wk === weekKey(new Date());

  const load = useCallback(async () => {
    if (!profile) return;
    const sb = supabase();
    const [{ data: pm }, { data: up }] = await Promise.all([
      sb.from("project_members").select("project:projects(id, title, short_code, stage)").eq("profile_id", profile.id),
      sb.from("weekly_updates").select("*, project:projects(title, short_code)").eq("author_id", profile.id).order("week_start", { ascending: false }).limit(30),
    ]);
    setProjects((pm ?? []).map((r) => r.project as unknown as Pick<Project, "id" | "title" | "short_code" | "stage">).filter((p) => p && !["published", "shelved"].includes(p.stage)));
    setRows((up ?? []) as WeeklyUpdate[]);
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  // Prefill the form when the (week, project) already has an entry.
  const existing = useMemo(() => rows?.find((r) => r.week_start === wk && (r.project_id ?? "") === project), [rows, wk, project]);
  useEffect(() => {
    setF(existing ? { did: existing.did ?? "", blocked: existing.blocked ?? "", next: existing.next ?? "", hours: existing.hours_compute?.toString() ?? "" } : { did: "", blocked: "", next: "", hours: "" });
  }, [existing]);

  const save = async () => {
    if (!f.did.trim() && !f.next.trim()) { toast("Write at least what you did or what's next.", "danger"); return; }
    setBusy(true);
    const row = { author_id: profile!.id, project_id: project || null, week_start: wk, did: f.did.trim() || null, blocked: f.blocked.trim() || null, next: f.next.trim() || null, hours_compute: f.hours ? Number(f.hours) : null };
    const { error } = existing
      ? await supabase().from("weekly_updates").update(row).eq("id", existing.id)
      : await supabase().from("weekly_updates").insert(row);
    setBusy(false);
    if (error) { toast(error.message, "danger"); return; }
    toast(existing ? "Update saved." : "Update posted. Thanks!", "success"); load();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader title={existing ? "Edit update" : "Post update"} subtitle={<span>Week of {fmtDate(week)}{thisWeek ? " (this week)" : ""}</span>}
          action={<div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setWeek(new Date(week.getTime() - 7 * 86400_000))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" disabled={thisWeek} onClick={() => setWeek(new Date(week.getTime() + 7 * 86400_000))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button>
          </div>} />
        <div className="space-y-4 px-5 pb-5">
          <Field label="Project"><ProjectSelect projects={projects} value={project} onChange={setProject} /></Field>
          <Field label="What did you do?" required><Textarea value={f.did} onChange={(e) => setF({ ...f, did: e.target.value })} placeholder="Results, figures, code, reading. Numbers help: 'gap converged to 1.82 eV at 6×6×1'." /></Field>
          <Field label="What's blocking you?" hint="Empty is fine. Cluster queue, unclear physics, waiting on someone?"><Textarea value={f.blocked} onChange={(e) => setF({ ...f, blocked: e.target.value })} className="min-h-16" /></Field>
          <Field label="Plan for next week" required><Textarea value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} className="min-h-16" /></Field>
          <div className="flex items-end justify-between gap-3">
            <Field label="Cluster hours used (optional)"><Input type="number" min={0} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} className="w-40" /></Field>
            <Button onClick={save} loading={busy}>{existing ? "Save changes" : "Post update"}</Button>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Your history" />
        <div className="divide-y divide-line px-5 pb-4">
          {rows === null ? <Spinner /> : rows.length === 0 ? <p className="py-3 text-sm text-muted">No updates yet. Your first one goes above.</p> : rows.map((r) => (
            <button key={r.id} onClick={() => { setWeek(new Date(r.week_start + "T12:00:00")); setProject(r.project_id ?? ""); }} className="block w-full py-2.5 text-left hover:bg-surface-2">
              <p className="text-sm font-medium">Week of {fmtDate(r.week_start + "T12:00:00")}</p>
              <p className="truncate text-xs text-muted">{r.project?.short_code ?? r.project?.title ?? "General"} · {r.did ?? r.next}</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- PI ---- */
interface Status { profile_id: string; full_name: string | null; email: string; role: MemberRole; submitted: boolean; last_update: string | null }

function LabView() {
  const [week, setWeek] = useState(() => labStartOfWeek(new Date()));
  const [status, setStatus] = useState<Status[]>([]);
  const [rows, setRows] = useState<WeeklyUpdate[] | null>(null);
  const wk = weekKey(week);
  const thisWeek = wk === weekKey(new Date());

  useEffect(() => {
    const sb = supabase();
    Promise.all([
      sb.from("weekly_update_status").select("*").order("full_name"),
      sb.from("weekly_updates").select("*, author:profiles!weekly_updates_author_id_fkey(full_name, email, avatar_url, role), project:projects(title, short_code)").eq("week_start", wk).order("created_at"),
    ]).then(([s, u]) => { setStatus((s.data ?? []) as Status[]); setRows((u.data ?? []) as WeeklyUpdate[]); });
  }, [wk]);

  const submittedIds = new Set(rows?.map((r) => r.author_id));
  const missing = status.filter((s) => !submittedIds.has(s.profile_id));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Week of {fmtDate(week)}{thisWeek ? " (this week)" : ""}</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setWeek(new Date(week.getTime() - 7 * 86400_000))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" disabled={thisWeek} onClick={() => setWeek(new Date(week.getTime() + 7 * 86400_000))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        {rows === null ? <Spinner /> : rows.length === 0 ? <Card><EmptyState icon={<ClipboardList className="h-8 w-8" />} title="No updates this week yet" body="Updates usually arrive on Friday." /></Card> : rows.map((u) => (
          <Card key={u.id} className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <Avatar src={u.author?.avatar_url} name={u.author?.full_name} email={u.author?.email} size={24} />
              <span className="font-medium">{u.author?.full_name ?? u.author?.email}</span>
              {u.author && <span className="text-xs text-muted">{ROLE_LABEL[u.author.role]}</span>}
              {u.project && <Badge tone="accent">{u.project.short_code ?? u.project.title}</Badge>}
              {u.blocked && <Badge tone="warn">Blocked</Badge>}
              {u.hours_compute != null && <span className="ml-auto text-xs text-muted">{u.hours_compute} cluster-h</span>}
            </div>
            <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[5rem_1fr]">
              {u.did && <><dt className="text-muted">Did</dt><dd className="whitespace-pre-wrap">{u.did}</dd></>}
              {u.blocked && <><dt className="font-medium text-warn">Blocked</dt><dd className="whitespace-pre-wrap">{u.blocked}</dd></>}
              {u.next && <><dt className="text-muted">Next</dt><dd className="whitespace-pre-wrap">{u.next}</dd></>}
            </dl>
          </Card>
        ))}
      </div>
      <Card className="self-start">
        <CardHeader title="Who's posted" subtitle={`${status.length - missing.length} of ${status.length}`} />
        <ul className="space-y-2 px-5 pb-5">
          {status.map((s) => {
            const ok = submittedIds.has(s.profile_id);
            return (
              <li key={s.profile_id} className="flex items-center gap-2 text-sm">
                {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-faint" />}
                <span className={ok ? "" : "text-muted"}>{s.full_name ?? s.email}</span>
                <span className="ml-auto text-[11px] text-faint">{ROLE_LABEL[s.role].split(" ")[0]}</span>
              </li>
            );
          })}
          {status.length === 0 && <li className="text-sm text-muted">No active members yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus, Sparkles, Trash2, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { ActionItemRow, Markdown, StageStepper, daysSince, isStale } from "@/components/research";
import { MeetingCard } from "@/components/MeetingCard";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/functions";
import { fmtDate } from "@/lib/format";
import { ROLE_LABEL, STAGE_LABEL, type ActionItem, type Meeting, type Profile, type Project, type ProjectMember, type ProjectStage, type Publication, type WeeklyUpdate } from "@/lib/types";

export default function ProjectViewPage() {
  return <AppShell><Suspense fallback={<Spinner />}><ProjectView /></Suspense></AppShell>;
}

function ProjectView() {
  const id = useSearchParams().get("id");
  const { profile, isPi } = useAuth();
  const toast = useToast();
  const [p, setP] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [updates, setUpdates] = useState<WeeklyUpdate[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [editing, setEditing] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [newDue, setNewDue] = useState("");
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const sb = supabase();
    const [pr, it, up, me, pu] = await Promise.all([
      sb.from("projects").select("*, members:project_members(project_id, profile_id, role, profile:profiles(id, full_name, email, avatar_url, role))").eq("id", id).maybeSingle(),
      sb.from("action_items").select("*, owner:profiles!action_items_owner_id_fkey(full_name, email, avatar_url)").eq("project_id", id).order("status").order("due_on", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
      sb.from("weekly_updates").select("*, author:profiles!weekly_updates_author_id_fkey(full_name, email, avatar_url, role)").eq("project_id", id).order("week_start", { ascending: false }).limit(20),
      sb.from("meetings").select("*, requester:profiles!meetings_requester_id_fkey(full_name, email, avatar_url, role)").eq("project_id", id).order("start_at", { ascending: false }).limit(10),
      sb.from("publications").select("*").eq("project_id", id),
    ]);
    if (!pr.data) { setMissing(true); return; }
    setP(pr.data as Project); setItems((it.data ?? []) as ActionItem[]); setUpdates((up.data ?? []) as WeeklyUpdate[]);
    setMeetings((me.data ?? []) as Meeting[]); setPubs((pu.data ?? []) as Publication[]);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (missing) return <Card><div className="p-8 text-center text-sm text-muted">Project not found. <Link href="/projects/" className="text-accent-text underline">Back to projects</Link></div></Card>;
  if (!p) return <Spinner />;

  const canEdit = isPi || p.members?.some((m) => m.profile_id === profile?.id);
  const setStage = async (stage: ProjectStage) => {
    const patch: Partial<Project> = { stage, last_activity: new Date().toISOString() };
    if (stage === "submitted" && !p.submitted_on) patch.submitted_on = new Date().toISOString().slice(0, 10);
    const { error } = await supabase().from("projects").update(patch).eq("id", p.id);
    if (error) toast(error.message, "danger"); else { toast(`Moved to ${STAGE_LABEL[stage]}.`, "success"); load(); }
  };
  const addItem = async () => {
    if (!newItem.trim()) return;
    const { error } = await supabase().from("action_items").insert({ project_id: p.id, owner_id: profile!.id, created_by: profile!.id, title: newItem.trim(), due_on: newDue || null });
    if (error) { toast(error.message, "danger"); return; }
    setNewItem(""); setNewDue(""); load();
  };
  const removeMember = async (pid: string) => {
    await supabase().from("project_members").delete().eq("project_id", p.id).eq("profile_id", pid); load();
  };
  const open = items.filter((i) => i.status === "open");
  const closed = items.filter((i) => i.status !== "open");

  return (
    <>
      <Link href="/projects/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft className="h-4 w-4" />Projects</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {p.short_code && <p className="font-mono text-xs uppercase tracking-wide text-faint">{p.short_code}</p>}
          <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {isStale(p) ? <span className="font-medium text-warn">Quiet for {daysSince(p.last_activity)} days · </span> : null}
            {p.target_journal && <>Target: {p.target_journal} · </>}
            {p.submitted_on && <>Submitted {fmtDate(p.submitted_on + "T12:00:00")} · </>}
            {p.revision_due && <span className="text-danger">Revision due {fmtDate(p.revision_due + "T12:00:00")} · </span>}
            Created {fmtDate(p.created_at)}
          </p>
        </div>
        {canEdit && <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit details</Button>}
      </div>

      <Card className="mb-5 px-4 py-3"><StageStepper stage={p.stage} onChange={canEdit ? setStage : undefined} />
        {p.stage === "shelved" && <p className="mt-2 text-xs text-muted">This project is shelved. {canEdit && <button className="text-accent-text underline" onClick={() => setStage("idea")}>Revive it</button>}</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-5">
          {p.summary && <Card className="px-5 py-4"><p className="whitespace-pre-wrap text-sm leading-relaxed">{p.summary}</p></Card>}

          <Card>
            <CardHeader title="Action items" subtitle={`${open.length} open`} action={closed.length ? <button className="text-xs text-muted hover:text-text" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"} {closed.length} closed</button> : null} />
            <div className="px-5 pb-4">
              <div className="divide-y divide-line">
                {open.length === 0 && !showDone && <p className="py-3 text-sm text-muted">Nothing open. Add the next concrete step below.</p>}
                {open.map((i) => <ActionItemRow key={i.id} item={i} showOwner onChanged={load} />)}
                {showDone && closed.map((i) => <ActionItemRow key={i.id} item={i} showOwner onChanged={load} />)}
              </div>
              {canEdit && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="Add a step, e.g. Converge k-mesh for 4×4 supercell" className="flex-1" />
                  <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="sm:w-40" />
                  <Button variant="secondary" onClick={addItem}><Plus className="h-4 w-4" />Add</Button>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Weekly updates" subtitle="What was done, what's blocked, what's next" action={<Link href={`/updates/?project=${p.id}`} className="text-xs text-accent-text hover:underline">Post update</Link>} />
            <div className="divide-y divide-line px-5 pb-2">
              {updates.length === 0 && <p className="pb-4 text-sm text-muted">No updates yet.</p>}
              {updates.map((u) => <UpdateRow key={u.id} u={u} />)}
            </div>
          </Card>

          {meetings.length > 0 && (
            <Card>
              <CardHeader title="Meetings about this project" />
              <div className="space-y-3 px-5 pb-5">{meetings.map((m) => <MeetingCard key={m.id} m={m} showRequester={isPi} onChanged={load} />)}</div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Team" action={canEdit ? <button onClick={() => setAddingMember(true)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text" title="Add member"><UserPlus className="h-4 w-4" /></button> : null} />
            <ul className="space-y-2.5 px-5 pb-5">
              {(p.members ?? []).map((m) => (
                <li key={m.profile_id} className="group flex items-center gap-2.5">
                  <Avatar src={m.profile?.avatar_url} name={m.profile?.full_name} email={m.profile?.email} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{m.profile?.full_name ?? m.profile?.email}</p>
                    <p className="text-[11px] text-muted">{m.role}{m.profile ? ` · ${ROLE_LABEL[m.profile.role]}` : ""}</p>
                  </div>
                  {canEdit && m.profile_id !== profile?.id && <button onClick={() => removeMember(m.profile_id)} className="rounded p-1 text-faint opacity-0 hover:text-danger group-hover:opacity-100" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Links" />
            <ul className="space-y-1.5 px-5 pb-5 text-sm">
              {p.manuscript_url && <li><a href={p.manuscript_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">Manuscript <ExternalLink className="h-3 w-3" /></a></li>}
              {p.repo_url && <li><a href={p.repo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">Code / data <ExternalLink className="h-3 w-3" /></a></li>}
              {p.arxiv_id && <li><a href={`https://arxiv.org/abs/${p.arxiv_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">arXiv:{p.arxiv_id} <ExternalLink className="h-3 w-3" /></a></li>}
              {p.doi && <li><a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">doi:{p.doi} <ExternalLink className="h-3 w-3" /></a></li>}
              {pubs.map((pb) => <li key={pb.id}><a href={pb.url ?? (pb.doi ? `https://doi.org/${pb.doi}` : "#")} target="_blank" rel="noreferrer" className="text-accent-text hover:underline">{pb.title}</a> <Badge tone={pb.status === "published" ? "success" : "neutral"}>{pb.status}</Badge></li>)}
              {p.external_collaborators && <li className="text-muted">Collaborators: {p.external_collaborators}</li>}
              {!p.manuscript_url && !p.repo_url && !p.arxiv_id && !p.doi && !pubs.length && <li className="text-muted">None yet.</li>}
            </ul>
          </Card>

          <AskAboutProject projectId={p.id} />
        </div>
      </div>

      <EditProjectModal open={editing} onClose={() => setEditing(false)} p={p} onSaved={load} />
      <AddMemberModal open={addingMember} onClose={() => setAddingMember(false)} p={p} onSaved={load} />
    </>
  );
}

function UpdateRow({ u }: { u: WeeklyUpdate }) {
  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
        {u.author && <Avatar src={u.author.avatar_url} name={u.author.full_name} email={u.author.email} size={18} />}
        <span className="font-medium text-text">{u.author?.full_name ?? u.author?.email}</span>
        <span>· week of {fmtDate(u.week_start + "T12:00:00")}</span>
        {u.hours_compute != null && <span>· {u.hours_compute} cluster-h</span>}
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[5rem_1fr]">
        {u.did && <><dt className="text-muted">Did</dt><dd className="whitespace-pre-wrap">{u.did}</dd></>}
        {u.blocked && <><dt className="text-warn">Blocked</dt><dd className="whitespace-pre-wrap">{u.blocked}</dd></>}
        {u.next && <><dt className="text-muted">Next</dt><dd className="whitespace-pre-wrap">{u.next}</dd></>}
      </dl>
    </div>
  );
}

function AskAboutProject({ projectId }: { projectId: string }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const ask = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try { const r = await callFn<{ answer: string }>("agent", { action: "ask", question: q, project_id: projectId }); setA(r.answer); }
    catch (e) { toast((e as Error).message, "danger"); }
    setBusy(false);
  };
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-accent" />Ask about this project</span>} />
      <div className="space-y-2 px-5 pb-5">
        <Textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What did we decide about the exchange-correlation functional? What's overdue?" className="min-h-16" />
        <Button size="sm" onClick={ask} loading={busy} className="w-full">Ask</Button>
        {a && <Markdown text={a} className="rounded-lg bg-surface-2 p-3" />}
      </div>
    </Card>
  );
}

function EditProjectModal({ open, onClose, p, onSaved }: { open: boolean; onClose: () => void; p: Project; onSaved: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { isPi } = useAuth();
  const [f, setF] = useState(p);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(p); }, [open, p]);
  const set = (k: keyof Project, v: string) => setF((x) => ({ ...x, [k]: v || null }));
  const save = async () => {
    setBusy(true);
    const { id, members: _m, created_at: _c, created_by: _b, last_activity: _l, stage: _s, ...rest } = f; // eslint-disable-line @typescript-eslint/no-unused-vars
    const { error } = await supabase().from("projects").update({ ...rest, last_activity: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    if (error) { toast(error.message, "danger"); return; }
    toast("Saved.", "success"); onClose(); onSaved();
  };
  const del = async () => {
    if (!confirm("Delete this project and its items? This cannot be undone.")) return;
    await supabase().from("projects").delete().eq("id", p.id);
    router.push("/projects/");
  };
  return (
    <Modal open={open} onClose={onClose} title="Project details" wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Title" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
        <Field label="Short code"><Input value={f.short_code ?? ""} onChange={(e) => set("short_code", e.target.value)} /></Field>
        <Field label="Target journal"><Input value={f.target_journal ?? ""} onChange={(e) => set("target_journal", e.target.value)} placeholder="PRB, npj Comput. Mater., …" /></Field>
        <div className="sm:col-span-2"><Field label="Summary"><Textarea value={f.summary ?? ""} onChange={(e) => set("summary", e.target.value)} /></Field></div>
        <Field label="Manuscript URL" hint="Overleaf / Drive"><Input value={f.manuscript_url ?? ""} onChange={(e) => set("manuscript_url", e.target.value)} /></Field>
        <Field label="Code / data URL"><Input value={f.repo_url ?? ""} onChange={(e) => set("repo_url", e.target.value)} /></Field>
        <Field label="arXiv ID"><Input value={f.arxiv_id ?? ""} onChange={(e) => set("arxiv_id", e.target.value)} placeholder="2409.12345" /></Field>
        <Field label="DOI"><Input value={f.doi ?? ""} onChange={(e) => set("doi", e.target.value)} placeholder="10.1103/…" /></Field>
        <Field label="Submitted on"><Input type="date" value={f.submitted_on ?? ""} onChange={(e) => set("submitted_on", e.target.value)} /></Field>
        <Field label="Revision due"><Input type="date" value={f.revision_due ?? ""} onChange={(e) => set("revision_due", e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="External collaborators"><Input value={f.external_collaborators ?? ""} onChange={(e) => set("external_collaborators", e.target.value)} /></Field></div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        {isPi ? <Button variant="danger" size="sm" onClick={del}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
        <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></div>
      </div>
    </Modal>
  );
}

function AddMemberModal({ open, onClose, p, onSaved }: { open: boolean; onClose: () => void; p: Project; onSaved: () => void }) {
  const toast = useToast();
  const [people, setPeople] = useState<Profile[]>([]);
  const [pid, setPid] = useState("");
  const [role, setRole] = useState<ProjectMember["role"]>("contributor");
  useEffect(() => {
    if (!open) return;
    supabase().from("profiles").select("*").eq("status", "active").order("full_name").then(({ data }) => {
      const existing = new Set((p.members ?? []).map((m) => m.profile_id));
      const list = ((data ?? []) as Profile[]).filter((x) => !existing.has(x.id));
      setPeople(list); setPid(list[0]?.id ?? "");
    });
  }, [open, p]);
  const add = async () => {
    if (!pid) return;
    const { error } = await supabase().from("project_members").insert({ project_id: p.id, profile_id: pid, role });
    if (error) { toast(error.message, "danger"); return; }
    onClose(); onSaved();
  };
  return (
    <Modal open={open} onClose={onClose} title="Add team member">
      <div className="space-y-4">
        <Field label="Person"><Select value={pid} onChange={(e) => setPid(e.target.value)}>{people.map((x) => <option key={x.id} value={x.id}>{x.full_name ?? x.email} — {ROLE_LABEL[x.role]}</option>)}</Select></Field>
        <Field label="Role on project"><Select value={role} onChange={(e) => setRole(e.target.value as ProjectMember["role"])}><option value="contributor">Contributor</option><option value="lead">Lead</option><option value="mentor">Mentor</option></Select></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={add} disabled={!pid}>Add</Button></div>
    </Modal>
  );
}

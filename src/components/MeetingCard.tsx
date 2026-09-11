"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { MapPin, Video, ExternalLink, Ban, NotebookPen, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Avatar, Badge, Button, Field, Modal, Textarea, useToast } from "@/components/ui";
import { Markdown } from "@/components/research";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { callFn, announceSlotsChanged } from "@/lib/functions";
import { fmtRange, fmtTime, fmtDateTime, labParts, relativeDay } from "@/lib/format";
import { TYPE_LABEL, type Meeting, type MeetingNote } from "@/lib/types";

const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function MeetingCard({ m, showRequester, onChanged, highlight }: { m: Meeting; showRequester?: boolean; onChanged?: () => void; highlight?: boolean }) {
  const toast = useToast();
  const { isPi } = useAuth();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const start = new Date(m.start_at);
  const p = labParts(start);
  const upcoming = m.status === "confirmed" && start.getTime() > now;
  const past = start.getTime() < now;
  const canNote = past && (m.status === "confirmed" || m.status === "completed");

  const cancel = async () => {
    setBusy(true);
    const { error } = await supabase().rpc("cancel_meeting", { p_id: m.id, p_reason: reason.trim() || null });
    if (error) { setBusy(false); toast(error.message, "danger"); return; }
    announceSlotsChanged().catch(() => {});
    try { await callFn("calendar-sync", { action: "cancel", meeting_id: m.id }); } catch { /* event may already be gone */ }
    setBusy(false); setCancelOpen(false);
    toast("Meeting cancelled.", "success");
    onChanged?.();
  };

  return (
    <div className={clsx("flex gap-4 rounded-xl border bg-surface p-4 shadow-card transition-colors", highlight ? "border-accent" : "border-line", m.status === "cancelled" && "opacity-70")}>
      <div className={clsx("flex w-14 shrink-0 flex-col items-center justify-center self-start rounded-lg py-2", upcoming ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-muted")}>
        <span className="text-[11px] font-medium uppercase">{MONTH[p.m - 1]}</span>
        <span className="text-xl font-semibold leading-none">{p.d}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{relativeDay(start)}, {fmtRange(m.start_at, m.end_at)}</span>
          <Badge tone="neutral">{TYPE_LABEL[m.type]}</Badge>
          {m.project && <Link href={`/projects/view/?id=${m.project.id}`}><Badge tone="accent">{m.project.short_code ?? m.project.title}</Badge></Link>}
          {m.status === "cancelled" && <Badge tone="danger">Cancelled{m.late_cancel ? " (late)" : ""}</Badge>}
          {m.status === "completed" && <Badge tone="success">Notes taken</Badge>}
          {m.status === "no_show" && <Badge tone="warn">No-show</Badge>}
        </div>
        {showRequester && m.requester && (
          <div className="mt-1.5 flex items-center gap-2 text-sm">
            <Avatar src={m.requester.avatar_url} name={m.requester.full_name} email={m.requester.email} size={20} />
            <span>{m.requester.full_name ?? m.requester.email}</span>
          </div>
        )}
        <p className="mt-1.5 line-clamp-2 text-sm text-muted">{m.agenda}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          {m.mode === "online" ? (
            m.meet_link ? (
              <a href={m.meet_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 font-medium text-accent-text hover:underline">
                <Video className="h-3.5 w-3.5" /> Join Google Meet <ExternalLink className="h-3 w-3" />
              </a>
            ) : <span className="inline-flex items-center gap-1"><Video className="h-3.5 w-3.5" /> Online · Meet link pending</span>
          ) : (
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {m.location ?? "In person"}</span>
          )}
          {m.cancel_reason && <span>· Reason: {m.cancel_reason}</span>}
          {canNote && (
            <button onClick={() => setNotesOpen(true)} className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium", m.status === "completed" ? "bg-surface-2 hover:bg-line" : "bg-accent-soft text-accent-text hover:underline")}>
              <NotebookPen className="h-3.5 w-3.5" /> {m.status === "completed" ? "View notes" : "Add notes"}
            </button>
          )}
          {isPi && upcoming && (
            <button onClick={() => setBriefOpen(!briefOpen)} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 font-medium hover:bg-line">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Brief me {briefOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
        {isPi && upcoming && briefOpen && <Brief m={m} onChanged={onChanged} />}
      </div>
      {upcoming && !past && (
        <div className="shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)} title="Cancel meeting"><Ban className="h-4 w-4" /><span className="hidden sm:inline">Cancel</span></Button>
        </div>
      )}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this meeting?">
        <p className="text-sm text-muted">{relativeDay(start)} at {fmtTime(start)}. The calendar event will be removed and the slot re-opened.</p>
        <div className="mt-4"><Field label="Reason (optional)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Let the other side know why." /></Field></div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep it</Button>
          <Button variant="danger" onClick={cancel} loading={busy}>Cancel meeting</Button>
        </div>
      </Modal>
      <NotesModal open={notesOpen} onClose={() => setNotesOpen(false)} m={m} onChanged={onChanged} />
    </div>
  );
}

/** PI-only: AI brief from the student's records, cached on the meeting row. */
function Brief({ m, onChanged }: { m: Meeting; onChanged?: () => void }) {
  const toast = useToast();
  const [text, setText] = useState(m.pi_brief);
  const [busy, setBusy] = useState(false);
  const gen = async () => {
    setBusy(true);
    try { const r = await callFn<{ brief: string }>("agent", { action: "brief", meeting_id: m.id }); setText(r.brief); onChanged?.(); }
    catch (e) { toast((e as Error).message, "danger"); }
    setBusy(false);
  };
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
      {text ? (
        <>
          <Markdown text={text} />
          <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
            <span>Generated {m.brief_generated_at ? fmtDateTime(m.brief_generated_at) : "just now"}</span>
            <button onClick={gen} disabled={busy} className="text-accent-text hover:underline">{busy ? "Refreshing…" : "Refresh"}</button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Get a one-minute summary of where this student is, what was decided last time, and what to ask.</p>
          <Button size="sm" onClick={gen} loading={busy}><Sparkles className="h-3.5 w-3.5" />Generate</Button>
        </div>
      )}
    </div>
  );
}

/** Notes for a past meeting: paste raw notes → AI extracts summary, decisions, action items. */
function NotesModal({ open, onClose, m, onChanged }: { open: boolean; onClose: () => void; m: Meeting; onChanged?: () => void }) {
  const toast = useToast();
  const { profile, isPi } = useAuth();
  const [note, setNote] = useState<MeetingNote | null>(null);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<{ id: string; title: string; owner_id: string; due_on: string | null; status: string }[]>([]);

  const load = async () => {
    const sb = supabase();
    const [{ data: n }, { data: ai }] = await Promise.all([
      sb.from("meeting_notes").select("*").eq("meeting_id", m.id).maybeSingle(),
      sb.from("action_items").select("id, title, owner_id, due_on, status").eq("meeting_id", m.id).order("created_at"),
    ]);
    setNote(n as MeetingNote | null); setRaw((n as MeetingNote | null)?.raw_notes ?? ""); setItems(ai ?? []); setLoading(false);
  };
  useEffect(() => { if (open) { setLoading(true); load(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const extract = async () => {
    if (raw.trim().length < 20) { toast("Write a few lines of notes first.", "danger"); return; }
    setBusy(true);
    try {
      await callFn("agent", { action: "extract", meeting_id: m.id, raw_notes: raw.trim() });
      toast("Notes summarised and action items created.", "success");
      await load(); onChanged?.();
    } catch (e) { toast((e as Error).message, "danger"); }
    setBusy(false);
  };
  const saveRaw = async () => {
    setBusy(true);
    const sb = supabase();
    const { error } = await sb.from("meeting_notes").upsert({ meeting_id: m.id, author_id: note?.author_id ?? profile!.id, raw_notes: raw.trim(), updated_at: new Date().toISOString() }, { onConflict: "meeting_id" });
    if (!error) await sb.from("meetings").update({ status: "completed" }).eq("id", m.id).eq("status", "confirmed");
    setBusy(false);
    if (error) { toast(error.message, "danger"); return; }
    toast("Notes saved.", "success"); await load(); onChanged?.();
  };
  const confirm = async () => {
    const patch = isPi ? { confirmed_by_pi: true } : { confirmed_by_requester: true };
    await supabase().from("meeting_notes").update(patch).eq("meeting_id", m.id); await load();
  };
  const confirmed = note && (isPi ? note.confirmed_by_pi : note.confirmed_by_requester);

  return (
    <Modal open={open} onClose={onClose} title={`Notes — ${relativeDay(m.start_at)}, ${fmtTime(m.start_at)}`} wide>
      {loading ? <p className="py-6 text-center text-sm text-muted">Loading…</p> : (
        <div className="space-y-4">
          <p className="text-sm text-muted">Agenda: {m.agenda}</p>
          {note?.summary && (
            <div className="rounded-lg border border-line bg-surface-2 p-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Summary</p>
              <p className="text-sm">{note.summary}</p>
              {note.decisions && note.decisions.length > 0 && (
                <><p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Decisions</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">{note.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></>
              )}
              {note.next_focus && <p className="mt-3 text-sm"><span className="font-medium">Next focus:</span> {note.next_focus}</p>}
              {items.length > 0 && (
                <><p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Action items</p>
                <ul className="space-y-0.5 text-sm">{items.map((i) => <li key={i.id} className={clsx("flex gap-2", i.status !== "open" && "line-through text-faint")}><span>•</span><span>{i.title}{i.due_on ? ` (due ${i.due_on})` : ""}{i.owner_id === profile?.id ? " — you" : isPi ? "" : " — PI"}</span></li>)}</ul></>
              )}
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className={note.confirmed_by_pi ? "text-success" : "text-faint"}>PI {note.confirmed_by_pi ? "confirmed" : "not confirmed"}</span>
                <span className={note.confirmed_by_requester ? "text-success" : "text-faint"}>Student {note.confirmed_by_requester ? "confirmed" : "not confirmed"}</span>
                {!confirmed && <button onClick={confirm} className="ml-auto text-accent-text hover:underline">Looks right — confirm</button>}
              </div>
            </div>
          )}
          <Field label={note?.summary ? "Raw notes" : "What was discussed?"} hint="Bullet points are fine. The assistant will write the summary, list the decisions, and create action items with owners.">
            <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="min-h-40 font-mono text-[13px]" placeholder={"- showed band structure for 2x2 supercell, gap 1.8 eV\n- PI: try HSE06, check against expt 2.1 eV\n- decided: use 4x4 for defects\n- next week: converge phonons, send draft of fig 2"} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={saveRaw} loading={busy}>Save notes only</Button>
            <Button onClick={extract} loading={busy}><Sparkles className="h-4 w-4" />{note?.summary ? "Re-extract with AI" : "Summarise & extract actions"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

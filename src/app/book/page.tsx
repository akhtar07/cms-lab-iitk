"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, MapPin, Video, CalendarX2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, EmptyState, Field, Modal, PageHeader, Segmented, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { callFn, announceSlotsChanged, SLOTS_CHANNEL } from "@/lib/functions";
import { buildWeekSlots, nextFreeSlot, type Slot } from "@/lib/slots";
import { fmtDate, fmtDateTime, fmtRange, fmtTime, fmtWeekday, isSameLabDay, labParts, labStartOfWeek } from "@/lib/format";
import { TYPE_LABEL, type AvailabilityBlock, type AvailabilityRule, type BusyRange, type MeetingMode, type MeetingType, type Project } from "@/lib/types";
import { ProjectSelect } from "@/components/research";

const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function BookPage() {
  return <AppShell><Book /></AppShell>;
}

function Book() {
  const { settings } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [weekStart, setWeekStart] = useState(() => labStartOfWeek(new Date()));
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [busy, setBusy] = useState<BusyRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [jumped, setJumped] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const from = new Date(weekStart.getTime() - 86400_000).toISOString();
    const to = new Date(weekStart.getTime() + 8 * 86400_000).toISOString();
    const [r, b, m] = await Promise.all([
      sb.from("availability_rules").select("*").eq("active", true),
      sb.from("availability_blocks").select("*").lt("start_at", to).gt("end_at", from),
      sb.from("meetings_busy").select("*").lt("start_at", to).gt("end_at", from),
    ]);
    setRules((r.data ?? []) as AvailabilityRule[]);
    setBlocks((b.data ?? []) as AvailabilityBlock[]);
    setBusy((m.data ?? []) as BusyRange[]);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Live: when anyone books, the slot greys out for everyone else instantly.
  useEffect(() => {
    const ch = supabase().channel(SLOTS_CHANNEL)
      .on("broadcast", { event: "changed" }, () => load())
      .subscribe();
    return () => { supabase().removeChannel(ch); };
  }, [load]);

  const days = useMemo(
    () => settings ? buildWeekSlots(weekStart, rules, blocks, busy, settings) : [],
    [weekStart, rules, blocks, busy, settings],
  );
  const anyRules = rules.length > 0 || blocks.some((b) => b.kind === "open");
  const freeThisWeek = days.some((d) => d.some((s) => s.state === "free"));
  // Office hours on one weekday mean the current week is often entirely past
  // or inside the notice period. Landing on an empty grid reads as "broken",
  // so open on the first week that actually has something free.
  const nextFree = useMemo(
    () => settings && anyRules ? nextFreeSlot(rules, blocks, settings) : null,
    [rules, blocks, settings, anyRules],
  );
  useEffect(() => {
    if (jumped || loading || freeThisWeek || !nextFree) return;
    setJumped(true);
    const target = labStartOfWeek(nextFree);
    if (target.getTime() !== weekStart.getTime()) setWeekStart(target);
  }, [jumped, loading, freeThisWeek, nextFree, weekStart]);
  const now = new Date();
  const wp = labParts(weekStart);
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400_000);
  const ep = labParts(weekEnd);
  const weekLabel = wp.m === ep.m ? `${wp.d}–${ep.d} ${MONTH[wp.m - 1]} ${wp.y}` : `${wp.d} ${MONTH[wp.m - 1]} – ${ep.d} ${MONTH[ep.m - 1]} ${ep.y}`;

  return (
    <>
      <PageHeader
        title="Book a meeting"
        subtitle={<>Slots are in {settings?.timezone ?? "lab time"}. Booked slots lock instantly for everyone.</>}
        action={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => setWeekStart(labStartOfWeek(new Date()))}>Today</Button>
            <Button variant="ghost" size="sm" aria-label="Previous week" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 86400_000))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-36 text-center text-sm font-medium">{weekLabel}</span>
            <Button variant="ghost" size="sm" aria-label="Next week" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 86400_000))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />

      {!loading && anyRules && !freeThisWeek && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3 text-sm">
            <CalendarX2 className="h-4 w-4 shrink-0 text-muted" />
            <span>{nextFree
              ? <>Nothing free this week. The next open slot is <strong>{fmtDateTime(nextFree)}</strong>.</>
              : <>No open slots left in the booking window. Ask the PI to add office hours.</>}</span>
          </div>
          {nextFree && labStartOfWeek(nextFree).getTime() !== weekStart.getTime() && (
            <Button size="sm" onClick={() => setWeekStart(labStartOfWeek(nextFree))}>Go to that week</Button>
          )}
        </Card>
      )}

      {loading ? <Spinner /> : !anyRules ? (
        <Card><EmptyState icon={<CalendarX2 className="h-8 w-8" />} title="No office hours published yet" body="The PI hasn't set availability. Check back soon or ask in the group." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="scroll-thin grid grid-cols-7 divide-x divide-line overflow-x-auto">
            {days.map((slots, i) => {
              const day = new Date(weekStart.getTime() + i * 86400_000);
              const p = labParts(day);
              const today = isSameLabDay(day, now);
              return (
                <div key={i} className="min-w-[7.5rem] sm:min-w-0">
                  <div className={clsx("sticky top-0 border-b border-line px-2 py-2.5 text-center", today ? "bg-accent-soft" : "bg-surface-2")}>
                    <p className={clsx("text-[11px] font-medium uppercase tracking-wide", today ? "text-accent-text" : "text-muted")}>{fmtWeekday(day)}</p>
                    <p className={clsx("text-lg font-semibold leading-tight", today && "text-accent-text")}>{p.d}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 p-1.5 sm:p-2">
                    {slots.length === 0 && <p className="py-6 text-center text-[11px] text-faint">—</p>}
                    {slots.map((s) => <SlotButton key={s.start.toISOString()} slot={s} onPick={() => setPicked(s)} />)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2.5 text-[11px] text-muted">
            <Legend cls="border-line-strong bg-surface" label="Available" />
            <Legend cls="border-transparent bg-surface-2 line-through" label="Booked" />
            <Legend cls="border-transparent bg-warn-soft" label="PI unavailable" />
            <Legend cls="border-transparent bg-surface-2 opacity-50" label="Too soon / past" />
          </div>
        </Card>
      )}

      <BookingModal
        slot={picked}
        onClose={() => setPicked(null)}
        onBooked={(id) => { setPicked(null); load(); toast("Meeting booked. Invites are on the way.", "success"); router.push(`/meetings/?new=${id}`); }}
      />
    </>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={clsx("inline-block h-3 w-5 rounded border", cls)} />{label}</span>;
}

function SlotButton({ slot, onPick }: { slot: Slot; onPick: () => void }) {
  const free = slot.state === "free";
  const title = {
    free: "Available", busy: "Already booked", blocked: "PI unavailable",
    past: "In the past", too_soon: "Too close to now to book", too_far: "Beyond the booking window",
  }[slot.state];
  return (
    <button type="button" disabled={!free} onClick={onPick} title={title}
      className={clsx(
        "flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-[12px] font-medium transition-colors",
        free && "border-line-strong bg-surface hover:border-accent hover:bg-accent-soft hover:text-accent-text",
        slot.state === "busy" && "border-transparent bg-surface-2 text-faint line-through",
        slot.state === "blocked" && "border-transparent bg-warn-soft text-warn/80",
        (slot.state === "past" || slot.state === "too_soon" || slot.state === "too_far") && "border-transparent bg-surface-2 text-faint opacity-60",
      )}>
      <span>{fmtTime(slot.start)}</span>
      {free && (slot.mode === "online" ? <Video className="h-3 w-3 text-muted" /> : slot.mode === "offline" ? <MapPin className="h-3 w-3 text-muted" /> : null)}
    </button>
  );
}

function BookingModal({ slot, onClose, onBooked }: { slot: Slot | null; onClose: () => void; onBooked: (id: string) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<MeetingMode>("online");
  const [type, setType] = useState<MeetingType>("progress");
  const [agenda, setAgenda] = useState("");
  const [project, setProject] = useState("");
  const [projects, setProjects] = useState<Pick<Project, "id" | "title" | "short_code">[]>([]);
  const [busy, setBusy] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    if (slot) { setMode(slot.mode === "offline" ? "offline" : "online"); setAgenda(""); setType("progress"); }
  }, [slot]);
  useEffect(() => {
    if (!profile) return;
    supabase().from("project_members").select("project:projects(id, title, short_code, stage)").eq("profile_id", profile.id)
      .then(({ data }) => {
        const list = (data ?? []).map((r) => r.project as unknown as Pick<Project, "id" | "title" | "short_code" | "stage">).filter((p) => p && !["published", "shelved"].includes(p.stage));
        setProjects(list); setProject(list.length === 1 ? list[0].id : "");
      });
  }, [profile]);

  if (!slot) return null;
  const modeLocked = slot.mode !== "both";

  const submit = async () => {
    if (agenda.trim().length < 10) { toast("Please write a short agenda (at least 10 characters).", "danger"); return; }
    setBusy(true);
    const { data, error } = await supabase().rpc("book_meeting", {
      p_start: slot.start.toISOString(), p_end: slot.end.toISOString(), p_mode: mode, p_type: type, p_agenda: agenda.trim(), p_project: project || null,
    });
    if (error) { setBusy(false); toast(error.message, "danger"); return; }
    announceSlotsChanged().catch(() => {});
    // Calendar + Meet link. Failure here doesn't lose the booking.
    try { await callFn("calendar-sync", { action: "create", meeting_id: data.id }); }
    catch (e) { toast(`Booked, but calendar sync failed: ${(e as Error).message}`, "danger"); }
    setBusy(false);
    onBooked(data.id);
  };

  return (
    <Modal open={!!slot} onClose={onClose} title="Confirm booking">
      <div className="rounded-lg bg-surface-2 px-4 py-3">
        <p className="font-medium">{fmtDate(slot.start)}</p>
        <p className="text-sm text-muted">{fmtRange(slot.start, slot.end)}{slot.location && mode === "offline" ? ` · ${slot.location}` : ""}</p>
      </div>
      <div className="mt-4 space-y-4">
        <Field label="Mode">
          <Segmented value={mode} onChange={(v) => !modeLocked && setMode(v)} options={[
            { value: "online", label: <span className="flex items-center gap-1.5"><Video className="h-3.5 w-3.5" />Online (Meet)</span> },
            { value: "offline", label: <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />In person</span> },
          ]} />
          {modeLocked && <p className="mt-1 text-xs text-muted">This slot is {slot.mode}-only.</p>}
        </Field>
        <Field label="Purpose">
          <Select value={type} onChange={(e) => setType(e.target.value as MeetingType)}>
            {(Object.keys(TYPE_LABEL) as MeetingType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        {projects.length > 0 && (
          <Field label="Project" hint="Links the meeting to a project so notes and action items land in the right place.">
            <ProjectSelect projects={projects} value={project} onChange={setProject} />
          </Field>
        )}
        <Field label="Agenda" required hint="What do you want to discuss? This goes on the calendar invite and helps the PI prepare.">
          <Textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="e.g. Convergence results for the 2×2 supercell; decide on HSE06 vs PBE+U for the final figures." autoFocus />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={busy}>Book slot</Button>
      </div>
    </Modal>
  );
}

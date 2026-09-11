import type { AvailabilityBlock, AvailabilityRule, BusyRange, LabSettings } from "./types";
import { labDate, labParts, labWeekday } from "./format";

export type SlotState = "free" | "busy" | "blocked" | "past" | "too_soon" | "too_far";

export interface Slot {
  start: Date;
  end: Date;
  mode: "online" | "offline" | "both";
  location: string | null;
  state: SlotState;
  ruleId?: string;
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

/**
 * Expand availability rules + one-off windows into concrete slots for the
 * seven days starting at `weekStart`, then mark each slot's state against
 * existing bookings, blocked time, and booking-window settings.
 */
export function buildWeekSlots(
  weekStart: Date,
  rules: AvailabilityRule[],
  blocks: AvailabilityBlock[],
  busy: BusyRange[],
  settings: Pick<LabSettings, "min_notice_hours" | "booking_horizon_days">,
  now = new Date(),
): Slot[][] {
  const days: Slot[][] = [];
  const minStart = now.getTime() + settings.min_notice_hours * 3600_000;
  const maxStart = now.getTime() + settings.booking_horizon_days * 86400_000;
  const busyRanges = busy.map((b) => [new Date(b.start_at).getTime(), new Date(b.end_at).getTime()] as const);
  const blockedRanges = blocks.filter((b) => b.kind === "blocked").map((b) => [new Date(b.start_at).getTime(), new Date(b.end_at).getTime()] as const);
  const openWindows = blocks.filter((b) => b.kind === "open");

  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(weekStart.getTime() + i * 86400_000);
    const p = labParts(dayStart);
    const dow = labWeekday(dayStart);
    const slots: Slot[] = [];

    for (const r of rules.filter((r) => r.active && r.weekday === dow)) {
      const [sh, sm] = r.start_time.split(":").map(Number);
      const [eh, em] = r.end_time.split(":").map(Number);
      let cur = labDate(p.y, p.m, p.d, sh, sm).getTime();
      const end = labDate(p.y, p.m, p.d, eh, em).getTime();
      const step = r.slot_minutes * 60_000;
      while (cur + step <= end) {
        slots.push({ start: new Date(cur), end: new Date(cur + step), mode: r.mode, location: r.location, state: "free", ruleId: r.id });
        cur += step;
      }
    }

    // One-off open windows: 30-minute slices
    for (const w of openWindows) {
      let cur = new Date(w.start_at).getTime();
      const end = new Date(w.end_at).getTime();
      const dayEnd = dayStart.getTime() + 86400_000;
      while (cur + 30 * 60_000 <= end) {
        if (cur >= dayStart.getTime() && cur < dayEnd) {
          slots.push({ start: new Date(cur), end: new Date(cur + 30 * 60_000), mode: "both", location: null, state: "free" });
        }
        cur += 30 * 60_000;
      }
    }

    slots.sort((a, b) => a.start.getTime() - b.start.getTime());

    for (const s of slots) {
      const st = s.start.getTime(), en = s.end.getTime();
      if (st < now.getTime()) s.state = "past";
      else if (busyRanges.some(([a, b]) => overlaps(st, en, a, b))) s.state = "busy";
      else if (blockedRanges.some(([a, b]) => overlaps(st, en, a, b))) s.state = "blocked";
      else if (st < minStart) s.state = "too_soon";
      else if (st > maxStart) s.state = "too_far";
    }
    days.push(slots);
  }
  return days;
}

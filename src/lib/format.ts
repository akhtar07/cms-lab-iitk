// All display is in the lab's timezone so a student travelling abroad still
// sees IST slots, matching what the PI sees.
let TZ = "Asia/Kolkata";
export function setLabTimezone(tz: string) { TZ = tz; }
export function labTimezone() { return TZ; }

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(opts: Intl.DateTimeFormatOptions) {
  const key = TZ + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) { f = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...opts }); cache.set(key, f); }
  return f;
}

export const fmtTime = (d: Date | string) => dtf({ hour: "numeric", minute: "2-digit" }).format(new Date(d));
export const fmtWeekday = (d: Date | string) => dtf({ weekday: "short" }).format(new Date(d));
export const fmtDate = (d: Date | string) => dtf({ weekday: "short", day: "numeric", month: "short" }).format(new Date(d));
export const fmtDateLong = (d: Date | string) => dtf({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(d));
export const fmtDateTime = (d: Date | string) => `${fmtDate(d)}, ${fmtTime(d)}`;
export const fmtRange = (a: Date | string, b: Date | string) => `${fmtTime(a)} – ${fmtTime(b)}`;

/** Y/M/D/H/M of an instant as seen in the lab timezone. */
export function labParts(d: Date) {
  const parts = Object.fromEntries(
    dtf({ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((p) => [p.type, p.value]),
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day, hh: +parts.hour % 24, mm: +parts.minute, ss: +parts.second };
}

/** Offset (ms) between lab-local wall time and UTC at the given instant. */
function tzOffsetMs(d: Date) {
  const p = labParts(d);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(d.getTime() / 1000) * 1000;
}

/** Build an instant from lab-local wall-clock components. */
export function labDate(y: number, m: number, d: number, hh = 0, mm = 0) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - tzOffsetMs(new Date(guess)));
}

/** Midnight (lab time) of the day containing `d`, plus `offsetDays`. */
export function labStartOfDay(d: Date, offsetDays = 0) {
  const p = labParts(d);
  return labDate(p.y, p.m, p.d + offsetDays);
}

/** Monday 00:00 (lab time) of the week containing `d`. */
export function labStartOfWeek(d: Date) {
  const p = labParts(d);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sun
  const back = (dow + 6) % 7;
  return labDate(p.y, p.m, p.d - back);
}

export function labWeekday(d: Date) {
  const p = labParts(d);
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

export const isSameLabDay = (a: Date, b: Date) => {
  const x = labParts(a), y = labParts(b);
  return x.y === y.y && x.m === y.m && x.d === y.d;
};

export function relativeDay(d: Date | string) {
  const t = new Date(d), now = new Date();
  if (isSameLabDay(t, now)) return "Today";
  if (isSameLabDay(t, new Date(now.getTime() + 86400_000))) return "Tomorrow";
  return fmtDate(t);
}

export const initials = (name?: string | null, email?: string) =>
  (name?.trim() || email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");

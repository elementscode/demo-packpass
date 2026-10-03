/**
 * Studio-wide constants and formatting. Times always render in the studio's
 * zone, so the server render and the browser agree whatever zone the member's
 * device is in.
 */
export const STUDIO_TZ = "America/Los_Angeles";

export const CANCEL_WINDOW_HOURS = 12;

export const REMINDER_HOURS = 2;

export type PackId = "pack5" | "pack10";

export interface Pack {
  id: PackId;
  name: string;
  credits: number;
  priceCents: number;
}

export const PACKS: Pack[] = [
  { id: "pack5", name: "5-class pack", credits: 5, priceCents: 10500 },
  { id: "pack10", name: "10-class pack", credits: 10, priceCents: 19000 },
];

export const UNLIMITED = { name: "Unlimited monthly", priceCents: 14900 };

export function findPack(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, hour: "numeric", minute: "2-digit" }).format(d);
}

export function formatDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, weekday: "long", month: "short", day: "numeric" }).format(d);
}

export function formatShortDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, weekday: "short", month: "short", day: "numeric" }).format(d);
}

export function formatWhen(d: Date): string {
  return `${formatShortDay(d)}, ${formatTime(d)}`;
}

/** The studio-local calendar date, as yyyy-mm-dd, for grouping by day. */
export function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STUDIO_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function hoursUntil(d: Date, now: Date = new Date()): number {
  return (+d - +now) / 3_600_000;
}

export function canCancelForCredit(startsAt: Date, now: Date = new Date()): boolean {
  return hoursUntil(startsAt, now) >= CANCEL_WINDOW_HOURS;
}

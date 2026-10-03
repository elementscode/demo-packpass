import { LiveView } from "@elements/app";
import { ScheduleClass } from "#app/shared/services/live";
import { dayKey, formatDay, STUDIO_TZ } from "#app/shared/studio";

export type Kind = "all" | "yoga" | "pilates";

export interface Day {
  key: string;
  name: string;
  num: string;
  label: string;
}

export function weekDays(from: Date): Day[] {
  let days: Day[] = [];
  let name = new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, weekday: "short" });
  let num = new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, day: "numeric" });

  for (let i = 0; i < 7; i++) {
    let d = new Date(+from + i * 86_400_000);
    days.push({ key: dayKey(d), name: i === 0 ? "Today" : name.format(d), num: num.format(d), label: formatDay(d) });
  }

  return days;
}

export function classesOn(schedule: LiveView<ScheduleClass>, day: string, kind: Kind = "all"): ScheduleClass[] {
  return schedule
    .filter((c) => dayKey(c.startsAt) === day && (kind === "all" || c.kind === kind))
    .sort((a, b) => +a.startsAt - +b.startsAt);
}

export function spotsLeft(c: ScheduleClass): number {
  return Math.max(0, c.capacity - c.booked);
}

export function endsAt(c: ScheduleClass): Date {
  return new Date(+c.startsAt + c.durationMinutes * 60_000);
}

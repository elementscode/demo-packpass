import { sql } from "@elements/app";

/**
 * Rows for tests. The test database has no seed, so each test builds what it
 * needs; every test rolls back, so nothing here outlives it.
 */

let counter = 0;

/**
 * Makes a value for a unique column unique to this call. Test files run in
 * parallel against one database, and two open transactions inserting the same
 * key block each other.
 */
export function unique(value: string): string {
  let suffix = crypto.randomUUID().slice(0, 8);
  let at = value.indexOf("@");

  return at < 0 ? `${value}-${suffix}` : `${value.slice(0, at)}-${suffix}${value.slice(at)}`;
}

export function makeUser(opts: { credits?: number; role?: "member" | "staff"; name?: string } = {}): string {
  counter++;

  return sql<{ id: string }>(`
    insert into users (email, name, passwordHash, role, credits)
         values (${unique(`member${counter}@test.local`)}, ${opts.name ?? `Member ${counter}`}, 'not-a-hash', ${opts.role ?? "member"}, ${opts.credits ?? 0})
      returning id
  `).firstOrThrow().id;
}

export function makeUnlimited(userId: string, opts: { cancelAtPeriodEnd?: boolean; endsInDays?: number } = {}) {
  sql(`
    insert into memberships (userId, status, currentPeriodEnd, cancelAtPeriodEnd)
         values (${userId}, 'active', now() + make_interval(days => ${opts.endsInDays ?? 30}), ${opts.cancelAtPeriodEnd ?? false})
  `);
}

export function makeClass(opts: { hoursFromNow?: number; capacity?: number } = {}): string {
  let instructor = sql<{ id: string }>(`insert into instructors (name) values ('Test Instructor') returning id`).firstOrThrow().id;
  let type = sql<{ id: string }>(`
    insert into classTypes (name, kind, durationMinutes, capacity) values ('Test Flow', 'yoga', 60, 10) returning id
  `).firstOrThrow().id;

  return sql<{ id: string }>(`
    insert into classSessions (classTypeId, instructorId, startsAt, durationMinutes, capacity)
         values (${type}, ${instructor}, now() + ${opts.hoursFromNow ?? 48} * interval '1 hour', 60, ${opts.capacity ?? 10})
      returning id
  `).firstOrThrow().id;
}

export function creditsOf(userId: string): number {
  return sql<{ credits: number }>(`select credits from users where id = ${userId}`).firstOrThrow().credits;
}

export function statusOf(sessionId: string, userId: string): string {
  return sql<{ status: string }>(`
    select status from bookings where sessionId = ${sessionId} and userId = ${userId}
     order by createdAt desc, id desc limit 1
  `).first()?.status ?? "none";
}

export function bookingId(sessionId: string, userId: string): string {
  return sql<{ id: string }>(`
    select id from bookings where sessionId = ${sessionId} and userId = ${userId} and status <> 'cancelled'
  `).firstOrThrow().id;
}

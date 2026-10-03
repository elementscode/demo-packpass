import { LiveTable, ForbiddenError, sql } from "@elements/app";

/**
 * The live rows the pages render. Every write goes through an rpc or a job,
 * and the triggers in the schema migration notify each table's channel with
 * the changed row's id, so each select below is also what a broadcast reads
 * back.
 */

export interface ScheduleClass {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  capacity: number;
  room: string;
  cancelledAt: Date | null;
  classTypeId: string;
  className: string;
  kind: "yoga" | "pilates";
  instructorId: string;
  instructorName: string;
  booked: number;
  waitlisted: number;
}

export interface MyBooking {
  id: string;
  userId: string;
  sessionId: string;
  status: "booked" | "waitlisted" | "cancelled";
  usedCredit: boolean;
  checkedInAt: Date | null;
  cancelledAt: Date | null;
  startsAt: Date;
  durationMinutes: number;
  className: string;
  kind: "yoga" | "pilates";
  instructorName: string;
  room: string;
  classCancelled: boolean;
  waitlistPosition: number;
}

export interface RosterEntry {
  id: string;
  sessionId: string;
  userId: string;
  status: "booked" | "waitlisted" | "cancelled";
  checkedInAt: Date | null;
  waitlistedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  memberName: string;
  memberEmail: string;
  unlimited: boolean;
  credits: number;
}

export interface Member {
  id: string;
  email: string;
  name: string;
  role: "member" | "staff";
  credits: number;
  createdAt: Date;
  membershipStatus: string | null;
  membershipEnds: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeManaged: boolean;
  upcoming: number;
  attended: number;
}

function readOnly(): never {
  throw new ForbiddenError("Use the page's actions to change this.");
}

export let schedule: LiveTable<ScheduleClass> = new LiveTable<ScheduleClass>({
  table: "class_sessions",
  select: (_, w) => sql<ScheduleClass>(`
    select s.id, s.startsAt, s.durationMinutes, s.capacity, s.room, s.cancelledAt,
           s.classTypeId, t.name as className, t.kind,
           s.instructorId, i.name as instructorName,
           (select count(*)::int from bookings b where b.sessionId = s.id and b.status = 'booked') as booked,
           (select count(*)::int from bookings b where b.sessionId = s.id and b.status = 'waitlisted') as waitlisted
      from classSessions s
      join classTypes t on t.id = s.classTypeId
      join instructors i on i.id = s.instructorId
     where s.startsAt >= now() - interval '1 day' and ${w.keyset("s")}
     order by ${w.order("s")} ${w.page()}
  `),
  insert: readOnly,
  update: readOnly,
  delete: readOnly,
});

export let myBookings: LiveTable<MyBooking> = new LiveTable<MyBooking>({
  table: "bookings",
  select: ({ userId }, w) => sql<MyBooking>(`
    select b.id, b.userId, b.sessionId, b.status, b.usedCredit, b.checkedInAt, b.cancelledAt,
           s.startsAt, s.durationMinutes, t.name as className, t.kind, i.name as instructorName, s.room,
           s.cancelledAt is not null as classCancelled,
           case when b.status = 'waitlisted' then
             (select count(*)::int from bookings q
               where q.sessionId = b.sessionId and q.status = 'waitlisted'
                 and (q.waitlistedAt, q.id) <= (b.waitlistedAt, b.id))
           else 0 end as waitlistPosition
      from bookings b
      join classSessions s on s.id = b.sessionId
      join classTypes t on t.id = s.classTypeId
      join instructors i on i.id = s.instructorId
     where b.userId = ${userId} and ${w.keyset("b")}
     order by ${w.order("b")} ${w.page()}
  `),
  insert: readOnly,
  update: readOnly,
  delete: readOnly,
});

export let roster: LiveTable<RosterEntry> = new LiveTable<RosterEntry>({
  table: "bookings",
  select: ({ sessionId }, w) => sql<RosterEntry>(`
    select b.id, b.sessionId, b.userId, b.status, b.checkedInAt, b.waitlistedAt, b.cancelledAt, b.createdAt,
           u.name as memberName, u.email as memberEmail, u.credits,
           exists (select 1 from memberships m where m.userId = u.id and m.status in ('active', 'trialing', 'past_due')) as unlimited
      from bookings b
      join users u on u.id = b.userId
     where b.sessionId = ${sessionId} and ${w.keyset("b")}
     order by ${w.order("b")} ${w.page()}
  `),
  insert: readOnly,
  update: readOnly,
  delete: readOnly,
});

export let members: LiveTable<Member> = new LiveTable<Member>({
  table: "users",
  select: (p, w) => sql<Member>(`
    select u.id, u.email, u.name, u.role, u.credits, u.createdAt,
           m.status as membershipStatus, m.currentPeriodEnd as membershipEnds,
           coalesce(m.cancelAtPeriodEnd, false) as cancelAtPeriodEnd,
           m.stripeSubscriptionId is not null as stripeManaged,
           (select count(*)::int from bookings b join classSessions s on s.id = b.sessionId
             where b.userId = u.id and b.status = 'booked' and s.startsAt > now()) as upcoming,
           (select count(*)::int from bookings b
             where b.userId = u.id and b.checkedInAt is not null) as attended
      from users u
      left join memberships m on m.userId = u.id
     where (${p.id ?? null}::uuid is null or u.id = ${p.id ?? null}::uuid) and ${w.keyset("u")}
     order by ${w.order("u")} ${w.page()}
  `),
  insert: readOnly,
  update: readOnly,
  delete: readOnly,
});

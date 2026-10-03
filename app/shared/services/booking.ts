import { sql, tx, session, NotFoundError, ValidationError } from "@elements/app";
import { EmailBookingJob } from "#app/jobs/email-booking";
import { CANCEL_WINDOW_HOURS } from "#app/shared/studio";
import { requireStaff } from "#app/shared/services/auth";

interface LockedClass {
  id: string;
  startsAt: Date;
  capacity: number;
  cancelledAt: Date | null;
}

export interface BookResult {
  status: "booked" | "waitlisted";
  usedCredit: boolean;
}

export interface CancelResult {
  refunded: boolean;
}

/**
 * True when the member's unlimited membership covers a class at `at`. A plan
 * set to cancel covers classes up to the end of the period already paid for.
 */
export function hasUnlimited(userId: string, at: Date): boolean {
  return !sql(`
    select 1 from memberships
     where userId = ${userId}
       and status in ('active', 'trialing', 'past_due')
       and (not cancelAtPeriodEnd or currentPeriodEnd is null or currentPeriodEnd > ${at})
  `).empty();
}

/**
 * Locks the class row. Booking, cancelling and promotion all take this lock
 * first, so two members can never both take the last spot.
 */
function lockClass(sessionId: string): LockedClass {
  let cls = sql<LockedClass>(`
    select id, startsAt, capacity, cancelledAt from classSessions where id = ${sessionId} for update
  `).first();

  if (!cls) {
    throw new NotFoundError("That class no longer exists.");
  }

  return cls;
}

function bookedCount(sessionId: string): number {
  return sql<{ n: number }>(`
    select count(*)::int as n from bookings where sessionId = ${sessionId} and status = 'booked'
  `).firstOrThrow().n;
}

function takeCredit(userId: string): boolean {
  return !sql(`
    update users set credits = credits - 1 where id = ${userId} and credits > 0 returning id
  `).empty();
}

function returnCredit(userId: string) {
  sql(`update users set credits = credits + 1 where id = ${userId}`);
}

/** Books the member into a class, or onto its waitlist when it is full. */
export function bookClassFor(userId: string, sessionId: string, now: Date = new Date()): BookResult {
  return tx(() => {
    let cls = lockClass(sessionId);

    if (cls.cancelledAt) {
      throw new ValidationError("This class was cancelled.");
    }

    if (cls.startsAt <= now) {
      throw new ValidationError("This class has already started.");
    }

    let existing = sql<{ status: string }>(`
      select status from bookings where sessionId = ${sessionId} and userId = ${userId} and status <> 'cancelled'
    `).first();

    if (existing) {
      throw new ValidationError(existing.status === "booked" ? "You're already booked." : "You're already on the waitlist.");
    }

    let unlimited = hasUnlimited(userId, cls.startsAt);

    if (bookedCount(sessionId) < cls.capacity) {
      if (!unlimited && !takeCredit(userId)) {
        throw new ValidationError("You're out of class credits. Buy a pack or go unlimited to book.");
      }

      sql(`
        insert into bookings (sessionId, userId, status, usedCredit)
             values (${sessionId}, ${userId}, 'booked', ${!unlimited})
      `);

      return { status: "booked", usedCredit: !unlimited };
    }

    // The credit is taken when a spot opens, not now, but a member needs one
    // to be worth holding a place for.
    if (!unlimited) {
      let credits = sql<{ credits: number }>(`select credits from users where id = ${userId}`).firstOrThrow().credits;

      if (credits < 1) {
        throw new ValidationError("You need a class credit to join the waitlist.");
      }
    }

    sql(`
      insert into bookings (sessionId, userId, status, waitlistedAt)
           values (${sessionId}, ${userId}, 'waitlisted', clock_timestamp())
    `);

    return { status: "waitlisted", usedCredit: false };
  });
}

/**
 * Fills open spots from the front of the waitlist. A member who can no longer
 * pay for the class (no credits, membership lapsed) is dropped from the list
 * and the next one is tried. Runs inside the caller's transaction, which
 * already holds the class lock.
 */
export function promoteWaitlist(sessionId: string, now: Date = new Date()): string[] {
  let cls = lockClass(sessionId);
  let promoted: string[] = [];

  if (cls.cancelledAt || cls.startsAt <= now) {
    return promoted;
  }

  let open = cls.capacity - bookedCount(sessionId);

  while (open > 0) {
    let next = sql<{ id: string; userId: string }>(`
      select id, userId from bookings
       where sessionId = ${sessionId} and status = 'waitlisted'
       order by waitlistedAt, id
       limit 1
         for update
    `).first();

    if (!next) {
      break;
    }

    let unlimited = hasUnlimited(next.userId, cls.startsAt);

    if (!unlimited && !takeCredit(next.userId)) {
      sql(`update bookings set status = 'cancelled', cancelledAt = now() where id = ${next.id}`);
      continue;
    }

    sql(`
      update bookings set status = 'booked', usedCredit = ${!unlimited}, promotedAt = now()
       where id = ${next.id}
    `);

    new EmailBookingJob({ bookingId: next.id, kind: "promoted" }).schedule();
    promoted.push(next.id);
    open--;
  }

  return promoted;
}

/**
 * Cancels a booking or a waitlist place. A booked class cancelled at least
 * CANCEL_WINDOW_HOURS ahead returns its credit, and the spot goes to the
 * first member on the waitlist.
 */
export function cancelBookingFor(userId: string | null, bookingId: string, now: Date = new Date(), refund?: boolean): CancelResult {
  return tx(() => {
    let found = sql<{ sessionId: string }>(`select sessionId from bookings where id = ${bookingId}`).first();

    if (!found) {
      throw new NotFoundError("Booking not found.");
    }

    let cls = lockClass(found.sessionId);

    let b = sql<{ id: string; userId: string; status: string; usedCredit: boolean }>(`
      select id, userId, status, usedCredit from bookings where id = ${bookingId} for update
    `).firstOrThrow();

    if (userId && b.userId !== userId) {
      throw new NotFoundError("Booking not found.");
    }

    if (b.status === "cancelled") {
      return { refunded: false };
    }

    if (userId && cls.startsAt <= now) {
      throw new ValidationError("This class has already started.");
    }

    let early = +cls.startsAt - +now >= CANCEL_WINDOW_HOURS * 3_600_000;
    let refunded = b.status === "booked" && b.usedCredit && (refund ?? early);

    sql(`update bookings set status = 'cancelled', cancelledAt = now() where id = ${bookingId}`);

    if (refunded) {
      returnCredit(b.userId);
    }

    if (b.status === "booked") {
      promoteWaitlist(cls.id, now);
    }

    return { refunded };
  });
}

/** @rpc */
export function bookClass(sessionId: string): BookResult {
  return bookClassFor(session.getOrThrow("userId"), sessionId);
}

/** @rpc */
export function cancelBooking(bookingId: string): CancelResult {
  return cancelBookingFor(session.getOrThrow("userId"), bookingId);
}

/** @rpc */
export function checkIn(bookingId: string, present: boolean) {
  requireStaff();

  sql(`
    update bookings set checkedInAt = ${present ? new Date() : null}
     where id = ${bookingId} and status = 'booked'
  `);
}

/** @rpc */
export function removeFromClass(bookingId: string, refund: boolean): CancelResult {
  requireStaff();

  return cancelBookingFor(null, bookingId, new Date(), refund);
}

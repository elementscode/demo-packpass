import { sql, tx, ValidationError, NotFoundError } from "@elements/app";
import { requireStaff } from "#app/shared/services/auth";
import { promoteWaitlist } from "#app/shared/services/booking";
import { STUDIO_TZ } from "#app/shared/studio";

export interface NewClass {
  classTypeId: string;
  instructorId: string;
  date: string;
  time: string;
  capacity: number;
  room: string;
}

export interface ClassChanges {
  instructorId: string;
  capacity: number;
  room: string;
}

/**
 * Adds one class to the schedule. The date and time are the studio's wall
 * clock, so Postgres converts them from the studio's zone.
 */
export function addClassAs(c: NewClass): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !/^\d{2}:\d{2}$/.test(c.time)) {
    throw new ValidationError("Pick a date and a start time.");
  }

  if (!c.classTypeId || !c.instructorId) {
    throw new ValidationError("Pick a class and an instructor.");
  }

  if (!(c.capacity > 0)) {
    throw new ValidationError("Capacity must be at least 1.");
  }

  return sql<{ id: string }>(`
    insert into classSessions (classTypeId, instructorId, startsAt, durationMinutes, capacity, room)
         select t.id, ${c.instructorId}, (${c.date + " " + c.time}::timestamp at time zone ${STUDIO_TZ}),
                t.durationMinutes, ${c.capacity}, ${c.room.trim() || "Studio A"}
           from classTypes t
          where t.id = ${c.classTypeId}
      returning id
  `).firstOrThrow("Class type not found.").id;
}

/**
 * Changes a class. Raising capacity fills the new spots from the waitlist;
 * capacity cannot drop below the members already booked.
 */
export function updateClassAs(sessionId: string, changes: ClassChanges): string[] {
  if (!(changes.capacity > 0)) {
    throw new ValidationError("Capacity must be at least 1.");
  }

  return tx(() => {
    let booked = sql<{ n: number }>(`
      select count(*)::int as n from bookings where sessionId = ${sessionId} and status = 'booked'
    `).firstOrThrow().n;

    if (changes.capacity < booked) {
      throw new ValidationError(`${booked} members are booked, so capacity can't go below ${booked}.`);
    }

    let updated = sql(`
      update classSessions
         set instructorId = ${changes.instructorId}, capacity = ${changes.capacity}, room = ${changes.room.trim() || "Studio A"}
       where id = ${sessionId}
      returning id
    `);

    if (updated.empty()) {
      throw new NotFoundError("Class not found.");
    }

    return promoteWaitlist(sessionId);
  });
}

/**
 * Cancels a class for everyone: every live booking and waitlist place is
 * cancelled, and every credit spent on it goes back.
 */
export function cancelClassAs(sessionId: string): number {
  return tx(() => {
    let updated = sql(`
      update classSessions set cancelledAt = now() where id = ${sessionId} and cancelledAt is null returning id
    `);

    if (updated.empty()) {
      return 0;
    }

    let live = sql<{ userId: string; refund: boolean }>(`
      select userId, usedCredit and status = 'booked' as refund
        from bookings
       where sessionId = ${sessionId} and status <> 'cancelled'
         for update
    `).all();

    sql(`
      update bookings set status = 'cancelled', cancelledAt = now()
       where sessionId = ${sessionId} and status <> 'cancelled'
    `);

    for (let r of live) {
      if (r.refund) {
        sql(`update users set credits = credits + 1 where id = ${r.userId}`);
      }
    }

    return live.length;
  });
}

export function adjustCreditsAs(userId: string, delta: number): number {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new ValidationError("Adjust by a whole number of credits.");
  }

  let row = sql<{ credits: number }>(`
    update users set credits = greatest(0, credits + ${delta}) where id = ${userId} returning credits
  `).first();

  if (!row) {
    throw new NotFoundError("Member not found.");
  }

  return row.credits;
}

/**
 * Grants or ends a studio-managed unlimited membership, for comps and staff
 * passes. A membership billed through Stripe is changed by the member, or in
 * the Stripe dashboard.
 */
export function setCompMembershipAs(userId: string, on: boolean) {
  let current = sql<{ stripeSubscriptionId: string | null; status: string }>(`
    select stripeSubscriptionId, status from memberships where userId = ${userId}
  `).first();

  if (current?.stripeSubscriptionId && current.status !== "canceled") {
    throw new ValidationError("This membership is billed through Stripe. The member can cancel it from their account.");
  }

  if (on) {
    sql(`
      insert into memberships (userId, status, currentPeriodEnd, cancelAtPeriodEnd)
           values (${userId}, 'active', now() + interval '30 days', false)
      on conflict (userId) do update set
        stripeSubscriptionId = null, stripeCustomerId = null, status = 'active',
        currentPeriodEnd = now() + interval '30 days', cancelAtPeriodEnd = false
    `);
    return;
  }

  sql(`update memberships set status = 'canceled', cancelAtPeriodEnd = false where userId = ${userId}`);
}

/** @rpc */
export function addClass(c: NewClass): string {
  requireStaff();

  return addClassAs(c);
}

/** @rpc */
export function updateClass(sessionId: string, changes: ClassChanges): number {
  requireStaff();

  return updateClassAs(sessionId, changes).length;
}

/** @rpc */
export function cancelClass(sessionId: string): number {
  requireStaff();

  return cancelClassAs(sessionId);
}

/** @rpc */
export function adjustCredits(userId: string, delta: number): number {
  requireStaff();

  return adjustCreditsAs(userId, delta);
}

/** @rpc */
export function setCompMembership(userId: string, on: boolean) {
  requireStaff();

  setCompMembershipAs(userId, on);
}

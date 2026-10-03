import { Job, sql, tx } from "@elements/app";
import { EmailBookingJob } from "#app/jobs/email-booking";
import { REMINDER_HOURS } from "#app/shared/studio";

/**
 * Finds every booked class starting within the reminder window that has not
 * been reminded yet, marks it, and queues its email. Marking and queueing
 * commit together, so a crash never sends twice or skips one.
 */
export class SendClassRemindersJob extends Job {
  static maxAttempts = 3;

  run() {
    tx(() => {
      let due = sql<{ id: string }>(`
        update bookings b
           set reminderSentAt = now()
          from classSessions s
         where s.id = b.sessionId
           and b.status = 'booked'
           and b.reminderSentAt is null
           and s.cancelledAt is null
           and s.startsAt > now()
           and s.startsAt <= now() + make_interval(hours => ${REMINDER_HOURS})
        returning b.id
      `).all();

      for (let row of due) {
        new EmailBookingJob({ bookingId: row.id, kind: "reminder" }).schedule({ idempotencyKey: `reminder:${row.id}` });
      }
    });
  }
}

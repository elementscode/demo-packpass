import { Job, email, sql } from "@elements/app";
import ClassReminderEmail from "#app/emails/class-reminder";
import WaitlistBookedEmail from "#app/emails/waitlist-booked";
import { formatWhen } from "#app/shared/studio";

export interface EmailBookingJobFields {
  bookingId: string;
  kind: "reminder" | "promoted";
}

interface BookingDetails {
  email: string;
  name: string;
  status: string;
  usedCredit: boolean;
  className: string;
  startsAt: Date;
  instructorName: string;
  room: string;
  cancelled: boolean;
}

/**
 * Emails a member about one booking: the two-hour reminder, or the news that
 * they came off the waitlist. Reads the booking when it runs, so a booking
 * cancelled in the meantime sends nothing.
 */
export class EmailBookingJob extends Job<EmailBookingJobFields> {
  static maxAttempts = 5;

  run() {
    let b = sql<BookingDetails>(`
      select u.email, u.name, b.status, b.usedCredit, t.name as className, s.startsAt,
             i.name as instructorName, s.room, s.cancelledAt is not null as cancelled
        from bookings b
        join users u on u.id = b.userId
        join classSessions s on s.id = b.sessionId
        join classTypes t on t.id = s.classTypeId
        join instructors i on i.id = s.instructorId
       where b.id = ${this.fields.bookingId}
    `).first();

    if (!b || b.status !== "booked" || b.cancelled) {
      return;
    }

    let details = {
      name: b.name.split(" ")[0],
      className: b.className,
      when: formatWhen(b.startsAt),
      instructorName: b.instructorName,
      room: b.room,
    };

    switch (this.fields.kind) {
      case "reminder":
        email({
          to: b.email,
          subject: `Reminder: ${b.className} at ${details.when}`,
          body: new ClassReminderEmail(details),
        });
        break;

      case "promoted":
        email({
          to: b.email,
          subject: `You're off the waitlist for ${b.className}`,
          body: new WaitlistBookedEmail({ ...details, paidWith: b.usedCredit ? "1 class credit" : "Unlimited membership" }),
        });
        break;
    }
  }
}

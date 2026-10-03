import { test, equal, sql } from "@elements/app";
import { SendClassRemindersJob } from "#app/jobs/send-class-reminders";
import { bookClassFor } from "#app/shared/services/booking";
import { makeUser, makeClass, bookingId } from "#app/shared/fixtures";

function reminderJobs(id: string): number {
  return sql<{ n: number }>(`
    select count(*)::int as n from elements.jobs where fields->>'bookingId' = ${id} and fields->>'kind' = 'reminder'
  `).firstOrThrow().n;
}

test("class reminders", () => {
  test("go out for classes starting within two hours, once", () => {
    let soon = makeClass({ hoursFromNow: 1.5 });
    let later = makeClass({ hoursFromNow: 5 });
    let user = makeUser({ credits: 2 });
    bookClassFor(user, soon);
    bookClassFor(user, later);

    let job = new SendClassRemindersJob();
    job.run();
    job.run();

    equal(reminderJobs(bookingId(soon, user)), 1);
    equal(reminderJobs(bookingId(later, user)), 0);
  });

  test("skip cancelled bookings", () => {
    let soon = makeClass({ hoursFromNow: 1 });
    let user = makeUser({ credits: 1 });
    bookClassFor(user, soon);
    let id = bookingId(soon, user);
    sql(`update bookings set status = 'cancelled' where id = ${id}`);

    let job = new SendClassRemindersJob();
    job.run();

    equal(reminderJobs(id), 0);
  });
});

import { test, equal } from "@elements/app";
import { schedule } from "#app/shared/services/live";
import { bookClassFor } from "#app/shared/services/booking";
import { dayKey } from "#app/shared/studio";
import { makeUser, makeClass } from "#app/shared/fixtures";
import { todayTotals } from "./template";

test("studio", () => {
  test("totals a day's bookings, waitlists and open spots", () => {
    let cls = makeClass({ hoursFromNow: 1, capacity: 1 });
    bookClassFor(makeUser({ credits: 1 }), cls);
    bookClassFor(makeUser({ credits: 1 }), cls);

    let view = schedule.view();
    let day = dayKey(view.get(cls)!.startsAt);
    let totals = todayTotals(view, day);

    equal(totals.booked >= 1, true);
    equal(totals.waitlisted >= 1, true);
    equal(view.get(cls)!.waitlisted, 1);
  });
});

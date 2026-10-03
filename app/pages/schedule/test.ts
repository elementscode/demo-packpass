import { test, equal, assert } from "@elements/app";
import { schedule } from "#app/shared/services/live";
import { bookClassFor } from "#app/shared/services/booking";
import { weekDays, classesOn, spotsLeft } from "#app/shared/schedule";
import { dayKey } from "#app/shared/studio";
import { makeUser, makeClass } from "#app/shared/fixtures";

test("schedule", () => {
  test("shows seven days starting today", () => {
    let now = new Date();
    let days = weekDays(now);

    equal(days.length, 7);
    equal(days[0].name, "Today");
    equal(days[0].key, dayKey(now));
  });

  test("lists a day's classes with live spot counts", () => {
    let cls = makeClass({ hoursFromNow: 1, capacity: 3 });
    bookClassFor(makeUser({ credits: 1 }), cls);

    let view = schedule.view();
    let startsAt = view.get(cls)!.startsAt;
    let day = classesOn(view, dayKey(startsAt));
    let row = day.find((c) => c.id === cls);

    assert(row !== undefined, "the class is on its day");
    equal(row!.className, "Test Flow");
    equal(row!.booked, 1);
    equal(spotsLeft(row!), 2);
    equal(classesOn(view, dayKey(startsAt), "pilates").some((c) => c.id === cls), false, "the kind filter applies");
  });
});

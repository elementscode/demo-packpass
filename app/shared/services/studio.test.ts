import { test, assert, equal, sql, ValidationError } from "@elements/app";
import { bookClassFor } from "#app/shared/services/booking";
import { addClassAs, updateClassAs, cancelClassAs, adjustCreditsAs, setCompMembershipAs } from "#app/shared/services/studio";
import { makeUser, makeClass, creditsOf, statusOf } from "#app/shared/fixtures";

test("studio", () => {
  test("adding a class reads the time in the studio's zone", () => {
    let t = sql<{ id: string }>(`insert into classTypes (name, kind, durationMinutes) values ('Slow Flow', 'yoga', 45) returning id`).firstOrThrow().id;
    let i = sql<{ id: string }>(`insert into instructors (name) values ('Kai') returning id`).firstOrThrow().id;

    let id = addClassAs({ classTypeId: t, instructorId: i, date: "2026-10-05", time: "18:30", capacity: 8, room: "" });

    let row = sql<{ local: string; durationMinutes: number; room: string }>(`
      select to_char(startsAt at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') as local, durationMinutes, room
        from classSessions where id = ${id}
    `).firstOrThrow();

    equal(row, { local: "2026-10-05 18:30", durationMinutes: 45, room: "Studio A" });
  });

  test("raising capacity books the waitlist in order", () => {
    let cls = makeClass({ capacity: 1 });
    let i = sql<{ id: string }>(`select instructorId as id from classSessions where id = ${cls}`).firstOrThrow().id;
    bookClassFor(makeUser({ credits: 1 }), cls);
    let a = makeUser({ credits: 1 });
    let b = makeUser({ credits: 1 });
    bookClassFor(a, cls);
    bookClassFor(b, cls);

    let promoted = updateClassAs(cls, { instructorId: i, capacity: 2, room: "Studio B" });

    equal(promoted.length, 1);
    equal(statusOf(cls, a), "booked");
    equal(statusOf(cls, b), "waitlisted");
  });

  test("capacity cannot drop below the members booked", () => {
    let cls = makeClass({ capacity: 3 });
    let i = sql<{ id: string }>(`select instructorId as id from classSessions where id = ${cls}`).firstOrThrow().id;
    bookClassFor(makeUser({ credits: 1 }), cls);
    bookClassFor(makeUser({ credits: 1 }), cls);

    let threw = false;

    try {
      updateClassAs(cls, { instructorId: i, capacity: 1, room: "Studio A" });
    } catch (err) {
      threw = true;
      assert(err instanceof ValidationError, `got ${err}`);
    }

    assert(threw);
  });

  test("cancelling a class refunds every credit spent on it", () => {
    let cls = makeClass({ capacity: 1, hoursFromNow: 2 });
    let booked = makeUser({ credits: 1 });
    let waiting = makeUser({ credits: 1 });
    bookClassFor(booked, cls);
    bookClassFor(waiting, cls);

    equal(cancelClassAs(cls), 2);
    equal(creditsOf(booked), 1);
    equal(creditsOf(waiting), 1);
    equal(statusOf(cls, booked), "cancelled");
    equal(statusOf(cls, waiting), "cancelled");
    equal(cancelClassAs(cls), 0, "a second cancel changes nothing");
  });

  test("credits adjust but never go negative", () => {
    let user = makeUser({ credits: 1 });

    equal(adjustCreditsAs(user, 2), 3);
    equal(adjustCreditsAs(user, -5), 0);
  });

  test("a comp membership can be granted and ended", () => {
    let user = makeUser();

    setCompMembershipAs(user, true);
    equal(sql<{ status: string }>(`select status from memberships where userId = ${user}`).firstOrThrow().status, "active");

    setCompMembershipAs(user, false);
    equal(sql<{ status: string }>(`select status from memberships where userId = ${user}`).firstOrThrow().status, "canceled");
  });
});

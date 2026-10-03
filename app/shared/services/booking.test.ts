import { test, assert, equal, sql, ValidationError } from "@elements/app";
import { bookClassFor, cancelBookingFor, hasUnlimited } from "#app/shared/services/booking";
import { makeUser, makeUnlimited, makeClass, creditsOf, statusOf, bookingId } from "#app/shared/fixtures";

async function expectValidation(fn: () => unknown, message: string) {
  let threw = false;

  try {
    await fn();
  } catch (err) {
    threw = true;
    assert(err instanceof ValidationError, `got ${err}`);
    assert(String((err as Error).message).includes(message), `message was ${(err as Error).message}`);
  }

  assert(threw, `expected it to throw "${message}"`);
}

test("booking", () => {
  test("a pack member spends one credit", () => {
    let user = makeUser({ credits: 3 });
    let cls = makeClass();

    let result = bookClassFor(user, cls);

    equal(result, { status: "booked", usedCredit: true });
    equal(creditsOf(user), 2);
    equal(statusOf(cls, user), "booked");
  });

  test("an unlimited member spends nothing", () => {
    let user = makeUser({ credits: 2 });
    makeUnlimited(user);
    let cls = makeClass();

    equal(bookClassFor(user, cls).usedCredit, false);
    equal(creditsOf(user), 2);
  });

  test("a cancelling membership stops covering classes after it ends", () => {
    let user = makeUser();
    makeUnlimited(user, { cancelAtPeriodEnd: true, endsInDays: 1 });

    equal(hasUnlimited(user, new Date(Date.now() + 3_600_000)), true);
    equal(hasUnlimited(user, new Date(Date.now() + 3 * 86_400_000)), false);
  });

  test("no credits, no booking", async () => {
    let user = makeUser({ credits: 0 });
    let cls = makeClass();

    await expectValidation(() => bookClassFor(user, cls), "out of class credits");
    equal(statusOf(cls, user), "none");
  });

  test("a member cannot book the same class twice", async () => {
    let user = makeUser({ credits: 3 });
    let cls = makeClass();

    bookClassFor(user, cls);
    await expectValidation(() => bookClassFor(user, cls), "already booked");
    equal(creditsOf(user), 2);
  });

  test("a class that has started cannot be booked", async () => {
    let user = makeUser({ credits: 3 });
    let cls = makeClass({ hoursFromNow: -1 });

    await expectValidation(() => bookClassFor(user, cls), "already started");
  });

  test("a full class puts the member on the waitlist without taking a credit", () => {
    let cls = makeClass({ capacity: 1 });
    let first = makeUser({ credits: 1 });
    let second = makeUser({ credits: 1 });

    bookClassFor(first, cls);
    let result = bookClassFor(second, cls);

    equal(result.status, "waitlisted");
    equal(creditsOf(second), 1);
  });

  test("the waitlist needs a credit or a membership", async () => {
    let cls = makeClass({ capacity: 1 });
    bookClassFor(makeUser({ credits: 1 }), cls);

    await expectValidation(() => bookClassFor(makeUser({ credits: 0 }), cls), "need a class credit");
  });
});

test("cancelling", () => {
  test("12 or more hours ahead returns the credit", () => {
    let user = makeUser({ credits: 1 });
    let cls = makeClass({ hoursFromNow: 13 });

    bookClassFor(user, cls);
    equal(creditsOf(user), 0);

    let result = cancelBookingFor(user, bookingId(cls, user));

    equal(result.refunded, true);
    equal(creditsOf(user), 1);
    equal(statusOf(cls, user), "cancelled");
  });

  test("inside 12 hours keeps the credit", () => {
    let user = makeUser({ credits: 1 });
    let cls = makeClass({ hoursFromNow: 11 });

    bookClassFor(user, cls);
    let result = cancelBookingFor(user, bookingId(cls, user));

    equal(result.refunded, false);
    equal(creditsOf(user), 0);
  });

  test("a member cannot cancel someone else's booking", () => {
    let owner = makeUser({ credits: 1 });
    let other = makeUser();
    let cls = makeClass();

    bookClassFor(owner, cls);

    let threw = false;

    try {
      cancelBookingFor(other, bookingId(cls, owner));
    } catch {
      threw = true;
    }

    assert(threw);
    equal(statusOf(cls, owner), "booked");
  });

  test("a cancelled spot goes to the first member on the waitlist", () => {
    let cls = makeClass({ capacity: 1 });
    let booked = makeUser({ credits: 1 });
    let firstInLine = makeUser({ credits: 2 });
    let secondInLine = makeUser({ credits: 2 });

    bookClassFor(booked, cls);
    bookClassFor(firstInLine, cls);
    bookClassFor(secondInLine, cls);

    cancelBookingFor(booked, bookingId(cls, booked));

    equal(statusOf(cls, firstInLine), "booked");
    equal(creditsOf(firstInLine), 1);
    equal(statusOf(cls, secondInLine), "waitlisted");

    let emails = sql<{ n: number }>(`
      select count(*)::int as n from elements.jobs
       where fields->>'bookingId' = ${bookingId(cls, firstInLine)} and fields->>'kind' = 'promoted'
    `).firstOrThrow().n;

    equal(emails, 1, "one promotion email is queued");
  });

  test("a waitlisted member who ran out of credits is skipped", () => {
    let cls = makeClass({ capacity: 1 });
    let booked = makeUser({ credits: 1 });
    let broke = makeUser({ credits: 1 });
    let next = makeUser({ credits: 1 });

    bookClassFor(booked, cls);
    bookClassFor(broke, cls);
    bookClassFor(next, cls);
    sql(`update users set credits = 0 where id = ${broke}`);

    cancelBookingFor(booked, bookingId(cls, booked));

    equal(statusOf(cls, broke), "cancelled");
    equal(statusOf(cls, next), "booked");
  });

  test("leaving the waitlist promotes no one", () => {
    let cls = makeClass({ capacity: 1 });
    let booked = makeUser({ credits: 1 });
    let waiting = makeUser({ credits: 1 });
    let behind = makeUser({ credits: 1 });

    bookClassFor(booked, cls);
    bookClassFor(waiting, cls);
    bookClassFor(behind, cls);

    cancelBookingFor(waiting, bookingId(cls, waiting));

    equal(statusOf(cls, behind), "waitlisted");
    equal(creditsOf(waiting), 1);
  });
});

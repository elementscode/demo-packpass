import { test, equal } from "@elements/app";
import { members, myBookings } from "#app/shared/services/live";
import { bookClassFor } from "#app/shared/services/booking";
import { makeUser, makeUnlimited, makeClass } from "#app/shared/fixtures";
import { paidMessage, isUnlimited } from "./template";

test("account", () => {
  test("confirms what was paid for", () => {
    equal(paidMessage("pack5"), "Payment received. 5 class credits were added to your account.");
    equal(paidMessage("unlimited").startsWith("Welcome to unlimited"), true);
    equal(paidMessage(""), "");
  });

  test("shows the member's own plan and bookings", () => {
    let user = makeUser({ credits: 4 });
    makeUnlimited(user);
    let cls = makeClass();
    bookClassFor(user, cls);

    let me = members.view({ id: user });
    let mine = myBookings.view({ userId: user });

    equal(me.length, 1);
    equal(isUnlimited(me.at(0)), true);
    equal(me.at(0)!.upcoming, 1);
    equal(mine.length, 1);
    equal(mine.at(0)!.status, "booked");
    equal(mine.at(0)!.usedCredit, false);
  });
});

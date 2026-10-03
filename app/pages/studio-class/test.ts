import { test, equal } from "@elements/app";
import { roster } from "#app/shared/services/live";
import { bookClassFor } from "#app/shared/services/booking";
import { makeUser, makeClass } from "#app/shared/fixtures";
import { booked, waiting } from "./template";

test("studio-class", () => {
  test("splits the roster from the waitlist, in line order", () => {
    let cls = makeClass({ capacity: 1 });
    bookClassFor(makeUser({ credits: 1, name: "Zed" }), cls);
    let first = makeUser({ credits: 1, name: "Yara" });
    let second = makeUser({ credits: 1, name: "Abe" });
    bookClassFor(first, cls);
    bookClassFor(second, cls);

    let view = roster.view({ sessionId: cls });

    equal(booked(view).map((r) => r.memberName), ["Zed"]);
    equal(waiting(view).map((r) => r.memberName), ["Yara", "Abe"]);
  });
});

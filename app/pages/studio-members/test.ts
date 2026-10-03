import { test, assert, equal } from "@elements/app";
import { members } from "#app/shared/services/live";
import { makeUser, makeUnlimited } from "#app/shared/fixtures";
import { visibleMembers, isUnlimited } from "./template";

test("studio-members", () => {
  test("lists members, not staff, and searches by name", () => {
    let quinn = makeUser({ name: "Quinn Harper" });
    let unlimited = makeUser({ name: "Rae Unlimited" });
    makeUnlimited(unlimited);
    makeUser({ name: "Desk Staff", role: "staff" });

    let view = members.view();

    equal(visibleMembers(view, "").some((m) => m.role === "staff"), false);
    let found = visibleMembers(view, "quinn");
    assert(found.some((m) => m.id === quinn), "the search missed Quinn");
    assert(!found.some((m) => m.id === unlimited), "the search matched another member");
    equal(isUnlimited(visibleMembers(view, "rae").find((m) => m.id === unlimited)!), true);
  });
});

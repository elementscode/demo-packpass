import { test, equal } from "@elements/app";
import { members } from "#app/shared/services/live";
import { makeUser, makeUnlimited } from "#app/shared/fixtures";
import { visibleMembers, isUnlimited } from "./template";

test("studio-members", () => {
  test("lists members, not staff, and searches by name", () => {
    makeUser({ name: "Quinn Harper" });
    let unlimited = makeUser({ name: "Rae Unlimited" });
    makeUnlimited(unlimited);
    makeUser({ name: "Desk Staff", role: "staff" });

    let view = members.view();

    equal(visibleMembers(view, "").some((m) => m.role === "staff"), false);
    equal(visibleMembers(view, "quinn").map((m) => m.name), ["Quinn Harper"]);
    equal(isUnlimited(visibleMembers(view, "rae")[0]), true);
  });
});

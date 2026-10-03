import { test, assert, equal, session, sql, ForbiddenError, ValidationError } from "@elements/app";
import { makeUser, makeClass, unique } from "#app/shared/fixtures";
import { instructors, classTypes } from "./template";

async function expectError(fn: () => unknown, kind: Function) {
  let threw = false;

  try {
    await fn();
  } catch (err) {
    threw = true;
    assert(err instanceof kind, `got ${err}`);
  }

  assert(threw, "expected an error");
}

test("studio-catalog", () => {
  test("members cannot edit the catalog", async () => {
    session.login({ userId: makeUser(), userName: "Member", role: "member" });

    await expectError(() => instructors.view().insert({ name: "Sneaky", specialty: "", bio: "" }), ForbiddenError);
  });

  test("staff add instructors and class types", () => {
    session.login({ userId: makeUser({ role: "staff" }), userName: "Staff", role: "staff" });

    let instructor = unique("Noor");
    let classType = unique("Restore");
    instructors.view().insert({ name: instructor, specialty: "Restorative", bio: "" });
    classTypes.view().insert({ name: classType, kind: "yoga", description: "", durationMinutes: 60, capacity: 10 });

    equal(sql<{ n: number }>(`select count(*)::int as n from instructors where name = ${instructor}`).firstOrThrow().n, 1);
    equal(sql<{ n: number }>(`select count(*)::int as n from classTypes where name = ${classType}`).firstOrThrow().n, 1);
  });

  test("a class type on the schedule cannot be deleted", async () => {
    session.login({ userId: makeUser({ role: "staff" }), userName: "Staff", role: "staff" });
    let cls = makeClass();
    let type = sql<{ id: string }>(`select classTypeId as id from classSessions where id = ${cls}`).firstOrThrow().id;
    let view = classTypes.view();

    await expectError(() => view.delete(view.get(type)!), ValidationError);
  });
});

import { test, assert, equal, session, sql, AuthError, ForbiddenError } from "@elements/app";
import { signin, requireStaff } from "#app/shared/services/auth";
import { makeUser, unique } from "#app/shared/fixtures";

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

test("auth", () => {
  test("signs in with the right password, case-insensitive email", () => {
    let email = unique("ada@test.local");
    sql(`
      insert into users (email, name, passwordHash, role)
           values (${email}, 'Ada', crypt('correct horse', genSalt('bf', 4)), 'staff')
    `);

    equal(signin(`  ${email.toUpperCase()} `, "correct horse"), "staff");
    equal(session.get("userName"), "Ada");
  });

  test("rejects a wrong password", async () => {
    let email = unique("bo@test.local");
    sql(`insert into users (email, name, passwordHash) values (${email}, 'Bo', crypt('right', genSalt('bf', 4)))`);

    await expectError(() => signin(email, "wrong"), AuthError);
  });

  test("staff pages turn members away", async () => {
    let member = makeUser();
    session.login({ userId: member, userName: "Member", role: "member" });

    await expectError(() => requireStaff(), ForbiddenError);
  });

  test("staff pages let staff in", () => {
    let staff = makeUser({ role: "staff" });
    session.login({ userId: staff, userName: "Staff", role: "staff" });

    equal(requireStaff(), staff);
  });
});

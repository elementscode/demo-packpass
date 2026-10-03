import { test, assert, equal, session, sql, AuthError } from "@elements/app";
import { signup } from "#app/shared/services/auth";
import { unique } from "#app/shared/fixtures";

async function expectAuthError(fn: () => unknown) {
  let threw = false;

  try {
    await fn();
  } catch (err) {
    threw = true;
    assert(err instanceof AuthError, `got ${err}`);
  }

  assert(threw, "expected an AuthError");
}

test("signup", () => {
  test("creates a member with no credits and signs them in", () => {
    let email = unique("Ada@Example.com");
    signup("Ada Lovelace", email, "analytical");

    let user = sql<{ email: string; role: string; credits: number }>(`
      select email, role, credits from users where email = ${email.toLowerCase()}
    `).firstOrThrow();

    equal(user, { email: email.toLowerCase(), role: "member", credits: 0 });
    equal(session.get("role"), "member");
  });

  test("rejects a short password and a bad email", async () => {
    await expectAuthError(() => signup("Bo", unique("bo@example.com"), "short"));
    await expectAuthError(() => signup("Bo", "not-an-email", "long enough"));
  });
});

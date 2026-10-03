import { test, equal, assert, session, sql, ValidationError } from "@elements/app";
import { buyPack, startMembership, cancelMembership } from "#app/shared/services/billing";
import { members } from "#app/shared/services/live";
import { makeUser, creditsOf } from "#app/shared/fixtures";
import { testCheckout } from "#app/shared/stripe";
import { payTestCheckout, testLine } from "./services";

function loginAs(userId: string) {
  session.login({ userId, userName: "Member", role: "member" });
}

test("checkout-test", () => {
  // Tests read config/env/development.env. With a Stripe key there, buying
  // goes to real Stripe Checkout, so only the catalog test runs.
  test("prices come from the catalog", () => {
    equal(testLine("pack10")!.amountCents, 19000);
    equal(testLine("unlimited")!.recurring, true);
    equal(testLine("pack99"), undefined);
  });

  test("buying a pack goes through the test checkout and adds its credits", async () => {
    if (!testCheckout()) {
      return;
    }

    let user = makeUser({ credits: 2 });
    loginAs(user);

    let url = await buyPack("pack5");
    equal(url, "/checkout/test/pack5");

    equal(payTestCheckout("pack5"), "/account?paid=pack5");
    equal(creditsOf(user), 7);

    let paid = sql<{ product: string; amountTotal: number; credits: number }>(`
      select product, amountTotal, credits from payments where userId = ${user}
    `).all();

    equal(paid, [{ product: "pack5", amountTotal: 10500, credits: 5 }]);
    equal(members.view({ id: user }).at(0)!.credits, 7, "the live member row shows the new credits");
  });

  test("the membership goes through the test checkout and can be cancelled", async () => {
    if (!testCheckout()) {
      return;
    }

    let user = makeUser();
    loginAs(user);

    equal(await startMembership(), "/checkout/test/unlimited");
    equal(payTestCheckout("unlimited"), "/account?paid=unlimited");

    let me = members.view({ id: user }).at(0)!;
    equal(me.membershipStatus, "active");
    equal(me.stripeManaged, true);

    await cancelMembership();

    let row = sql<{ cancelAtPeriodEnd: boolean }>(`select cancelAtPeriodEnd from memberships where userId = ${user}`).firstOrThrow();
    equal(row.cancelAtPeriodEnd, true);
  });

  test("a second membership is refused", () => {
    if (!testCheckout()) {
      return;
    }

    let user = makeUser();
    loginAs(user);
    payTestCheckout("unlimited");

    let threw = false;

    try {
      payTestCheckout("unlimited");
    } catch (err) {
      threw = true;
      assert(err instanceof ValidationError, `got ${err}`);
    }

    assert(threw);
  });
});

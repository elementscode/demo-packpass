import { test, equal, sql } from "@elements/app";
import { grantPack, saveMembership } from "#app/shared/checkout";
import { makeUser, creditsOf } from "#app/shared/fixtures";

test("checkout", () => {
  test("a paid pack adds its credits once", () => {
    let user = makeUser({ credits: 1 });

    equal(grantPack("cs_test_one", user, "pack10", 19000, "usd"), true);
    equal(grantPack("cs_test_one", user, "pack10", 19000, "usd"), false, "the webhook repeating the return page grants nothing");
    equal(creditsOf(user), 11);
  });

  test("an unknown product grants nothing", () => {
    let user = makeUser();

    equal(grantPack("cs_test_two", user, "pack99", 100, "usd"), false);
    equal(creditsOf(user), 0);
  });

  test("a subscription replaces a comp membership and later syncs by id", () => {
    let user = makeUser();
    sql(`insert into memberships (userId, status) values (${user}, 'canceled')`);

    saveMembership({ userId: user, stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1", status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000), cancelAtPeriodEnd: false });
    saveMembership({ stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1", status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: true });

    let row = sql<{ status: string; cancelAtPeriodEnd: boolean; stripeSubscriptionId: string }>(`
      select status, cancelAtPeriodEnd, stripeSubscriptionId from memberships where userId = ${user}
    `).firstOrThrow();

    equal(row, { status: "active", cancelAtPeriodEnd: true, stripeSubscriptionId: "sub_1" });
  });
});

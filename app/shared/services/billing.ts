import { session, sql, ValidationError } from "@elements/app";
import { stripe, testCheckout } from "#app/shared/stripe";
import { startPackCheckout, startMembershipCheckout, syncSubscription } from "#app/shared/checkout";
import { findPack } from "#app/shared/studio";

function buyer(): { id: string; email: string } {
  let userId = session.getOrThrow("userId");

  return sql<{ id: string; email: string }>(`select id, email from users where id = ${userId}`).firstOrThrow();
}

/** @rpc */
export async function buyPack(packId: string): Promise<string> {
  if (!findPack(packId)) {
    throw new ValidationError("Pick a 5 or 10 class pack.");
  }

  return await startPackCheckout(buyer(), packId);
}

export function hasMembership(userId: string): boolean {
  return !sql(`
    select 1 from memberships where userId = ${userId} and status in ('active', 'trialing', 'past_due')
  `).empty();
}

/** @rpc */
export async function startMembership(): Promise<string> {
  let me = buyer();

  if (hasMembership(me.id)) {
    throw new ValidationError("You already have an unlimited membership.");
  }

  return await startMembershipCheckout(me);
}

async function setCancelAtPeriodEnd(cancel: boolean) {
  let userId = session.getOrThrow("userId");
  let row = sql<{ stripeSubscriptionId: string | null }>(`
    select stripeSubscriptionId from memberships where userId = ${userId}
  `).first();

  if (!row?.stripeSubscriptionId) {
    throw new ValidationError("Your membership is managed by the studio. Ask at the front desk.");
  }

  // A membership taken through the test checkout has no Stripe subscription
  // behind it, so its row is the whole record.
  if (testCheckout() || row.stripeSubscriptionId.startsWith("test_")) {
    sql(`update memberships set cancelAtPeriodEnd = ${cancel} where userId = ${userId}`);
    return;
  }

  await stripe().subscriptions.update(row.stripeSubscriptionId, { cancel_at_period_end: cancel });
  await syncSubscription(row.stripeSubscriptionId);
}

/** @rpc */
export async function cancelMembership() {
  await setCancelAtPeriodEnd(true);
}

/** @rpc */
export async function resumeMembership() {
  await setCancelAtPeriodEnd(false);
}

import Stripe from "stripe";
import { getAppUrl, sql, tx } from "@elements/app";
import { stripe, testCheckout } from "#app/shared/stripe";
import { ensureWebhook } from "#app/shared/stripe-webhook";
import { findPack, UNLIMITED } from "#app/shared/studio";

interface Buyer {
  id: string;
  email: string;
}

/** Returns the url to send the buyer to: Stripe, or the test checkout. */
export async function startPackCheckout(buyer: Buyer, packId: string): Promise<string> {
  let pack = findPack(packId);

  if (!pack) {
    throw new Error(`unknown pack ${packId}`);
  }

  if (testCheckout()) {
    return `/checkout/test/${pack.id}`;
  }

  await ensureWebhook();

  let checkout = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: buyer.email,
    client_reference_id: buyer.id,
    metadata: { product: pack.id },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: pack.priceCents,
        product_data: { name: `PackPass ${pack.name}`, description: `${pack.credits} class credits, any yoga or Pilates class.` },
      },
    }],
    success_url: `${getAppUrl()}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getAppUrl()}/account#buy`,
  });

  return checkout.url!;
}

/** Returns the url to send the buyer to: Stripe, or the test checkout. */
export async function startMembershipCheckout(buyer: Buyer): Promise<string> {
  if (testCheckout()) {
    return "/checkout/test/unlimited";
  }

  await ensureWebhook();

  let checkout = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: buyer.email,
    client_reference_id: buyer.id,
    metadata: { product: "unlimited" },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: UNLIMITED.priceCents,
        recurring: { interval: "month" },
        product_data: { name: `PackPass ${UNLIMITED.name}`, description: "Every class, every week. Cancel any time." },
      },
    }],
    success_url: `${getAppUrl()}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getAppUrl()}/account#buy`,
  });

  return checkout.url!;
}

/**
 * The one place a pack payment is recorded, real or test. Adds the pack's
 * credits once: the insert is the guard, so a second call for the same
 * session inserts nothing and grants nothing.
 */
export function grantPack(stripeSessionId: string, userId: string, packId: string, amountTotal: number, currency: string): boolean {
  let pack = findPack(packId);

  if (!pack) {
    return false;
  }

  return tx(() => {
    let inserted = sql(`
      insert into payments (stripeSessionId, userId, product, credits, amountTotal, currency)
           values (${stripeSessionId}, ${userId}, ${pack.id}, ${pack.credits}, ${amountTotal}, ${currency})
      on conflict (stripeSessionId) do nothing
        returning id
    `);

    if (inserted.empty()) {
      return false;
    }

    sql(`update users set credits = credits + ${pack.credits} where id = ${userId}`);

    return true;
  });
}

export interface MembershipState {
  userId?: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Copies a subscription's state into the member's row. Only a call that
 * knows the member creates the row; a webhook for one the app has not seen
 * only updates.
 */
export function saveMembership(m: MembershipState) {
  if (!m.userId) {
    sql(`
      update memberships
         set status = ${m.status}, currentPeriodEnd = ${m.currentPeriodEnd}, cancelAtPeriodEnd = ${m.cancelAtPeriodEnd}
       where stripeSubscriptionId = ${m.stripeSubscriptionId}
    `);
    return;
  }

  sql(`
    insert into memberships (userId, stripeSubscriptionId, stripeCustomerId, status, currentPeriodEnd, cancelAtPeriodEnd)
         values (${m.userId}, ${m.stripeSubscriptionId}, ${m.stripeCustomerId}, ${m.status}, ${m.currentPeriodEnd}, ${m.cancelAtPeriodEnd})
    on conflict (userId) do update set
      stripeSubscriptionId = excluded.stripeSubscriptionId,
      stripeCustomerId = excluded.stripeCustomerId,
      status = excluded.status,
      currentPeriodEnd = excluded.currentPeriodEnd,
      cancelAtPeriodEnd = excluded.cancelAtPeriodEnd
  `);
}

export async function syncSubscription(subscriptionId: string, userId?: string) {
  let sub: Stripe.Subscription = await stripe().subscriptions.retrieve(subscriptionId);
  let periodEnd = sub.items.data[0]?.current_period_end;

  saveMembership({
    userId,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: sub.customer as string,
    status: sub.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });
}

export type FulfillResult = { paid: false } | { paid: true; product: string };

/**
 * Records a paid Checkout Session. Idempotent: the return page and the
 * webhook both call it, in either order, any number of times. Trusts only
 * what it reads back from Stripe.
 */
export async function fulfillCheckout(sessionId: string): Promise<FulfillResult> {
  let checkout = await stripe().checkout.sessions.retrieve(sessionId);
  let userId = checkout.client_reference_id;
  let product = checkout.metadata?.product ?? "";

  if (checkout.status !== "complete" || !userId) {
    return { paid: false };
  }

  if (checkout.mode === "subscription") {
    await syncSubscription(checkout.subscription as string, userId);

    return { paid: true, product: "unlimited" };
  }

  if (checkout.payment_status !== "paid") {
    return { paid: false };
  }

  grantPack(checkout.id, userId, product, checkout.amount_total ?? 0, checkout.currency ?? "usd");

  return { paid: true, product };
}

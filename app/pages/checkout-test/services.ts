import { ForbiddenError, ValidationError, session } from "@elements/app";
import { grantPack, saveMembership } from "#app/shared/checkout";
import { hasMembership } from "#app/shared/services/billing";
import { testCheckout } from "#app/shared/stripe";
import { findPack, UNLIMITED } from "#app/shared/studio";

export interface TestLine {
  product: string;
  name: string;
  description: string;
  amountCents: number;
  recurring: boolean;
}

/** What the test checkout sells, priced from the app's own catalog. */
export function testLine(product: string): TestLine | undefined {
  if (product === "unlimited") {
    return {
      product,
      name: `PackPass ${UNLIMITED.name}`,
      description: "Every class, every week. Cancel any time.",
      amountCents: UNLIMITED.priceCents,
      recurring: true,
    };
  }

  let pack = findPack(product);

  if (!pack) {
    return undefined;
  }

  return {
    product: pack.id,
    name: `PackPass ${pack.name}`,
    description: `${pack.credits} class credits, any yoga or Pilates class.`,
    amountCents: pack.priceCents,
    recurring: false,
  };
}

/**
 * Pays for a pack or the membership without Stripe. Development only, with
 * no key set. Records through the same functions a Stripe payment does.
 * Returns where to send the buyer next.
 *
 * @rpc
 */
export function payTestCheckout(product: string): string {
  if (!testCheckout()) {
    throw new ForbiddenError("The test checkout is off.");
  }

  let userId = session.getOrThrow("userId");
  let line = testLine(product);

  if (!line) {
    throw new ValidationError("Pick a 5 or 10 class pack, or the unlimited membership.");
  }

  if (!line.recurring) {
    grantPack(`test_${crypto.randomUUID()}`, userId, line.product, line.amountCents, "usd");

    return `/account?paid=${line.product}`;
  }

  if (hasMembership(userId)) {
    throw new ValidationError("You already have an unlimited membership.");
  }

  saveMembership({
    userId,
    stripeSubscriptionId: `test_${userId}`,
    stripeCustomerId: `test_${userId}`,
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    cancelAtPeriodEnd: false,
  });

  return "/account?paid=unlimited";
}

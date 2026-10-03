import { Request, Response } from "@elements/app";
import { stripe } from "#app/shared/stripe";
import { webhookSecret } from "#app/shared/stripe-webhook";
import { fulfillCheckout, syncSubscription } from "#app/shared/checkout";

export default async function route(req: Request, res: Response) {
  let event;

  try {
    event = stripe().webhooks.constructEvent(
      req.bodyBuffer!,
      req.headers["stripe-signature"] as string,
      webhookSecret(),
    );
  } catch {
    res.status(400).send("invalid signature");
    return;
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfillCheckout(event.data.object.id);
      break;

    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object.id);
      break;
  }

  return "ok";
}

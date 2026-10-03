import { Request, Response, redirect } from "@elements/app";
import { fulfillCheckout } from "#app/shared/checkout";

/** Where Stripe sends the buyer back. Records the payment, then shows the account. */
export default async function route(req: Request, res: Response) {
  let result = await fulfillCheckout(String(req.query.session_id ?? ""));

  redirect(result.paid ? `/account?paid=${result.product}` : "/account?paid=pending");
}

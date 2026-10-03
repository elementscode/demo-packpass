import { Request, Response, sql } from "@elements/app";
import { requireMember } from "#app/shared/services/auth";
import { members, myBookings } from "#app/shared/services/live";
import html, { PaymentRow } from "./template";

export default function route(req: Request, res: Response) {
  let userId = requireMember();

  if (!userId) {
    return;
  }

  let payments = sql<PaymentRow>(`
    select id, product, credits, amountTotal, createdAt from payments
     where userId = ${userId}
     order by createdAt desc
  `).all();

  return new html({
    me: members.view({ id: userId }),
    mine: myBookings.view({ userId }),
    payments,
    paid: String(req.query.paid ?? ""),
    welcome: req.query.welcome === "1",
  });
}

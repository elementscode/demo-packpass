import { NotFoundError, Request, Response, sql } from "@elements/app";
import { requireMember } from "#app/shared/services/auth";
import { testCheckout } from "#app/shared/stripe";
import { testLine } from "./services";
import html from "./template";

export default function route(req: Request, res: Response) {
  if (!testCheckout()) {
    throw new NotFoundError();
  }

  let userId = requireMember();

  if (!userId) {
    return;
  }

  let line = testLine(String(req.params.product));

  if (!line) {
    throw new NotFoundError();
  }

  let email = sql<{ email: string }>(`select email from users where id = ${userId}`).firstOrThrow().email;

  return new html({ line, email });
}

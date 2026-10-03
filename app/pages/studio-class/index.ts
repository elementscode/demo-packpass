import { Request, Response, NotFoundError, sql } from "@elements/app";
import { requireStaff } from "#app/shared/services/auth";
import { schedule, roster } from "#app/shared/services/live";
import html from "./template";

export default function route(req: Request, res: Response) {
  requireStaff();

  let sessionId = String(req.params.id);

  let isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);

  if (!isUuid || sql(`select 1 from classSessions where id = ${sessionId}`).empty()) {
    throw new NotFoundError("That class is not on the schedule.");
  }

  return new html({
    classes: schedule.view(),
    roster: roster.view({ sessionId }),
    sessionId,
  });
}

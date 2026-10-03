import { Request, Response } from "@elements/app";
import { requireMember } from "#app/shared/services/auth";
import { schedule, myBookings, members } from "#app/shared/services/live";
import html from "./template";

export default function route(req: Request, res: Response) {
  let userId = requireMember();

  if (!userId) {
    return;
  }

  return new html({
    schedule: schedule.view(),
    mine: myBookings.view({ userId }),
    me: members.view({ id: userId }),
    now: new Date(),
  });
}

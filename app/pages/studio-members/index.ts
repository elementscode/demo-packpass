import { Request, Response } from "@elements/app";
import { requireStaff } from "#app/shared/services/auth";
import { members } from "#app/shared/services/live";
import html from "./template";

export default function route(req: Request, res: Response) {
  requireStaff();

  return new html({ members: members.view() });
}

import { Request, Response, sql } from "@elements/app";
import { requireStaff } from "#app/shared/services/auth";
import { schedule } from "#app/shared/services/live";
import html, { Option } from "./template";

export default function route(req: Request, res: Response) {
  requireStaff();

  return new html({
    schedule: schedule.view(),
    classTypes: sql<Option>(`select id, name, capacity from classTypes order by name`).all(),
    instructors: sql<Option>(`select id, name, 0 as capacity from instructors order by name`).all(),
    now: new Date(),
  });
}

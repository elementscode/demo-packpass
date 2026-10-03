import { Request, Response } from "@elements/app";
import { requireStaff } from "#app/shared/services/auth";
import html, { instructors, classTypes } from "./template";

export default function route(req: Request, res: Response) {
  requireStaff();

  return new html({
    instructorList: instructors.view(),
    classTypeList: classTypes.view(),
  });
}

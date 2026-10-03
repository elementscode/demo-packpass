import { Request, Response, redirect, session, sql } from "@elements/app";
import html, { DemoLogin } from "./template";

export default function route(req: Request, res: Response) {
  if (session.isLoggedIn()) {
    redirect(session.get("role") === "staff" ? "/studio" : "/");
    return;
  }

  // The seeded accounts, so a visitor can sign in without signing up.
  let demoLogins = sql<DemoLogin>(`
    select u.id, u.name, u.email, u.role,
           case when u.role = 'staff' then 'Front desk and admin'
                when m.id is not null and m.cancelAtPeriodEnd then 'Unlimited, cancelling'
                when m.id is not null then 'Unlimited monthly'
                else u.credits || case when u.credits = 1 then ' credit left' else ' credits left' end
           end as plan
      from users u
      left join memberships m on m.userId = u.id
     where u.email like '%@packpass.test'
     order by u.role desc, u.name
  `).all();

  return new html({ demoLogins });
}

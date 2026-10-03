/**
 * The keys the app stores in the session, so `session.get("userId")` is
 * typed. `role` is a copy for rendering the nav; every staff rpc and route
 * re-reads the role from the users table.
 */
declare module "@elements/app" {
  interface SessionData {
    userId: string;
    userName: string;
    role: "member" | "staff";
  }
}

export {};

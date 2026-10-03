import { sql, session, AuthError, ForbiddenError, redirect } from "@elements/app";

export const MIN_PASSWORD = 8;

interface SigninUser {
  id: string;
  name: string;
  role: "member" | "staff";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/** @rpc */
export function signin(email: string, password: string): "member" | "staff" {
  let address = normalizeEmail(email);

  if (!address || !password) {
    throw new AuthError("Enter your email and password.");
  }

  let user = sql<SigninUser>(`
    select id, name, role from users
     where email = ${address}
       and passwordHash = crypt(${password}, passwordHash)
  `).first();

  if (!user) {
    throw new AuthError("That email and password don't match.");
  }

  session.login({ userId: user.id, userName: user.name, role: user.role });

  return user.role;
}

/** @rpc */
export function signup(name: string, email: string, password: string) {
  let address = normalizeEmail(email);
  let fullName = name.trim();

  if (!fullName) {
    throw new AuthError("Tell us your name.");
  }

  if (!isEmail(address)) {
    throw new AuthError("Enter a valid email address.");
  }

  if (password.length < MIN_PASSWORD) {
    throw new AuthError(`Passwords are at least ${MIN_PASSWORD} characters.`);
  }

  if (!sql(`select 1 from users where email = ${address}`).empty()) {
    throw new AuthError("That email is already registered. Sign in instead.");
  }

  let user = sql<{ id: string }>(`
    insert into users (email, name, passwordHash)
         values (${address}, ${fullName}, crypt(${password}, genSalt('bf', 12)))
      returning id
  `).firstOrThrow();

  session.login({ userId: user.id, userName: fullName, role: "member" });
}

/** @rpc */
export function signout() {
  session.logout();
  redirect("/signin");
}

/**
 * Sends a visitor with no session to the sign-in page and returns undefined,
 * so the route returns early.
 */
export function requireMember(): string | undefined {
  if (!session.isLoggedIn()) {
    redirect("/signin");
    return undefined;
  }

  return session.getOrThrow("userId");
}

export function isStaff(userId: string): boolean {
  return !sql(`select 1 from users where id = ${userId} and role = 'staff'`).empty();
}

export function requireStaff(): string {
  session.isLoggedInOrThrow();

  let userId = session.getOrThrow("userId");

  if (!isStaff(userId)) {
    throw new ForbiddenError("Staff access only.");
  }

  return userId;
}

-- add studio schema

-- Auto-update updatedAt on row changes.
create or replace function touchUpdatedAt()
returns trigger
language plpgsql
as $$
begin
  new.updatedAt = now();
  return new;
end;
$$;

create type userRole as enum ('member', 'staff');
create type classKind as enum ('yoga', 'pilates');
create type bookingStatus as enum ('booked', 'waitlisted', 'cancelled');

create table users (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  email text not null unique,
  name text not null,
  passwordHash text not null,
  role userRole not null default 'member',
  credits integer not null default 0 check (credits >= 0)
);

create trigger usersTouchUpdatedAt
  before update on users
  for each row execute function touchUpdatedAt();

-- The monthly unlimited plan. A row with no stripeSubscriptionId was granted
-- by the studio (a comp or the seed), not bought through Stripe.
create table memberships (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  userId uuid not null unique references users (id) on delete cascade,
  stripeSubscriptionId text unique,
  stripeCustomerId text,
  status text not null,
  currentPeriodEnd timestamptz,
  cancelAtPeriodEnd boolean not null default false
);

create trigger membershipsTouchUpdatedAt
  before update on memberships
  for each row execute function touchUpdatedAt();

-- One row per paid class pack. stripeSessionId is unique because the return
-- page and the webhook both record the same payment.
create table payments (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  stripeSessionId text not null unique,
  userId uuid not null references users (id) on delete cascade,
  product text not null,
  credits integer not null,
  amountTotal integer not null,
  currency text not null
);

create trigger paymentsTouchUpdatedAt
  before update on payments
  for each row execute function touchUpdatedAt();

create table instructors (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  name text not null,
  specialty text not null default '',
  bio text not null default ''
);

create trigger instructorsTouchUpdatedAt
  before update on instructors
  for each row execute function touchUpdatedAt();

create table classTypes (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  name text not null,
  kind classKind not null,
  description text not null default '',
  durationMinutes integer not null default 60 check (durationMinutes > 0),
  capacity integer not null default 12 check (capacity > 0)
);

create trigger classTypesTouchUpdatedAt
  before update on classTypes
  for each row execute function touchUpdatedAt();

create table classSessions (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  classTypeId uuid not null references classTypes (id),
  instructorId uuid not null references instructors (id),
  startsAt timestamptz not null,
  durationMinutes integer not null check (durationMinutes > 0),
  capacity integer not null check (capacity > 0),
  room text not null default 'Studio A',
  cancelledAt timestamptz
);

create index classSessionsStartsAt on classSessions (startsAt);

create trigger classSessionsTouchUpdatedAt
  before update on classSessions
  for each row execute function touchUpdatedAt();

create table bookings (
  id uuid primary key default uuidGenerateV7(),
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  sessionId uuid not null references classSessions (id) on delete cascade,
  userId uuid not null references users (id) on delete cascade,
  status bookingStatus not null,
  -- false when an unlimited membership covered the class, so a cancel
  -- refunds nothing.
  usedCredit boolean not null default false,
  waitlistedAt timestamptz,
  promotedAt timestamptz,
  cancelledAt timestamptz,
  checkedInAt timestamptz,
  reminderSentAt timestamptz
);

-- A member holds at most one live spot (booked or waitlisted) per class.
create unique index bookingsOneLivePerMember on bookings (sessionId, userId)
  where status <> 'cancelled';

create index bookingsSessionStatus on bookings (sessionId, status);

create trigger bookingsTouchUpdatedAt
  before update on bookings
  for each row execute function touchUpdatedAt();

-- Live updates. Every write to these tables, from an rpc, a job, the webhook
-- or psql, notifies the table channels of the LiveTables in
-- app/shared/services/live.ts.
-- The payload is the row id only: each app server reads the row back through
-- the view's select, which is where the joined names and counts come from.
create or replace function notifyLive(channel text, op text, rowId uuid)
returns void
language plpgsql
as $$
begin
  perform pg_notify(channel_name(channel), json_build_object('op', op, 'id', rowId)::text);
end;
$$;

create or replace function bookingsNotify()
returns trigger
language plpgsql
as $$
declare
  r record;
  w record;
begin
  r := coalesce(new, old);

  perform notifyLive('class_sessions', 'update', r.sessionId);
  perform notifyLive('bookings', lower(tg_op), r.id);
  perform notifyLive('users', 'update', r.userId);

  -- Everyone still waiting in this class may have moved up a place.
  for w in
    select id, userId from bookings
     where sessionId = r.sessionId and status = 'waitlisted' and id <> r.id
  loop
    perform notifyLive('bookings', 'update', w.id);
  end loop;

  return r;
end;
$$;

create trigger bookingsNotifyTrigger
  after insert or update or delete on bookings
  for each row execute function bookingsNotify();

create or replace function classSessionsNotify()
returns trigger
language plpgsql
as $$
declare
  r record;
  b record;
begin
  r := coalesce(new, old);

  perform notifyLive('class_sessions', lower(tg_op), r.id);

  if tg_op = 'UPDATE' then
    for b in select id, userId from bookings where sessionId = r.id loop
      perform notifyLive('bookings', 'update', b.id);
    end loop;
  end if;

  return r;
end;
$$;

create trigger classSessionsNotifyTrigger
  after insert or update or delete on classSessions
  for each row execute function classSessionsNotify();

create or replace function usersNotify()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  r := coalesce(new, old);

  perform notifyLive('users', lower(tg_op), r.id);

  return r;
end;
$$;

create trigger usersNotifyTrigger
  after insert or update or delete on users
  for each row execute function usersNotify();

create or replace function membershipsNotify()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  r := coalesce(new, old);

  perform notifyLive('users', 'update', r.userId);

  return r;
end;
$$;

create trigger membershipsNotifyTrigger
  after insert or update or delete on memberships
  for each row execute function membershipsNotify();

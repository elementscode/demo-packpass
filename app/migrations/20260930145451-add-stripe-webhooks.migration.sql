-- add stripe webhooks: the endpoint the app registers in production, one row
-- per url it has served from. Stripe returns an endpoint's signing secret only
-- when it is created, so it is kept here.

create table stripeWebhooks (
  url text primary key,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  endpointId text not null,
  secret text not null
);

create trigger stripeWebhooksTouchUpdatedAt
  before update on stripeWebhooks
  for each row execute function touchUpdatedAt();

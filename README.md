![PackPass, a class booking app for a yoga and Pilates studio built with Elements: the weekly schedule with spots left on each class, a full Reformer class with a waitlist, and the member's credits and upcoming classes.](https://elements.dev/demos/01a0f465-5b24-7e17-a800-9cc003b6eb36/poster?v=5b36ed54779e)

# PackPass

> A demo app built with [Elements](https://elements.dev).

Class packs and memberships by card, a weekly schedule with spots left, waitlists that book the next member, and live rosters.

**Demo:** [PackPass](https://elements.dev/demos/01a0f465-5b24-7e17-a800-9cc003b6eb36)

## Agent specs

- **Agent:** Claude Code, Opus 5.5 Medium
- **Time:** 21 min
- **Cost:** $9.70 at API rates, September 2026

## Get started

```bash
elements create packpass -scaffold=elementscode/demo-packpass
```

## Demo accounts

The seed creates the studio staff login, three instructors, five class types,
a week of classes starting today, and eight members on class packs and
unlimited memberships, with bookings across the week. Tomorrow's 9:30 Reformer
Pilates class is full with two members on the waitlist. Every account's
password is `packpass`, and the sign-in page lists them.

| Email                 | Role   | Plan                    |
| --------------------- | ------ | ----------------------- |
| staff@packpass.test   | staff  |                         |
| maya@packpass.test    | member | Unlimited monthly       |
| hannah@packpass.test  | member | Unlimited monthly       |
| sam@packpass.test     | member | Unlimited, cancelling   |
| jordan@packpass.test  | member | 7 credits               |
| lena@packpass.test    | member | 8 credits               |
| priya@packpass.test   | member | 2 credits               |
| diego@packpass.test   | member | 1 credit, on a waitlist |
| theo@packpass.test    | member | 0 credits               |

## Payments

Members pay for a 5-class pack, a 10-class pack, or a monthly unlimited
subscription. Without a Stripe key, payments run through the app's built-in
test checkout: the pay buttons open an order summary with a Pay button, and
paying adds the credits or starts the membership exactly as a real payment
does. No card is asked for.

For real Stripe Checkout, create a free sandbox at
[dashboard.stripe.com/register](https://dashboard.stripe.com/register), copy
the secret key from Developers, API keys, and set it as `STRIPE_SECRET_KEY` in
`config/env/development.env`. Test with card 4242 4242 4242 4242, any future
date and any CVC. Production requires the key (the app refuses to start
without it) and registers its own Stripe webhook the first time a member
starts a checkout.

Emails (waitlist promotions and reminders two hours before class) are written
to `.elements/logs/job.log` in development.

## How it's built

PackPass needed class credits and a monthly membership paid by card, a schedule that counts spots as members book, waitlists that fill themselves, reminder emails and live rosters for the front desk. Each of those is a part of Elements, so the agent spent its 21 minutes on the studio itself.

### What Elements gave the app

- **Live schedule and rosters.** The schedule, each member's bookings, the class rosters and the member list are LiveTables. Spots left, the front desk's roster with its check-in boxes and each member's credits update the moment anyone books or cancels.

- **Waitlists that book the next member.** Booking locks the class first, so the last spot goes to exactly one member and a full class puts the next one on the waitlist. When someone cancels, the first member on the waitlist who can still pay gets the place and an email saying so.

- **Packs and memberships by card.** Members buy a class pack or a monthly unlimited membership through Stripe. Credits are granted when the member returns and again when Stripe's webhook arrives, once either way. Until a Stripe key is set, the pay buttons open a test checkout inside the app that records the purchase the same way, and in production the app registers its own webhook on the first checkout.

- **Server calls as function calls.** Booking, cancelling, check-in and buying a pack call server functions straight from the page with `@rpc`.

- **Background work.** A one-line cron schedule checks every five minutes for classes two hours out and queues a reminder email job for each booked member, and a member who comes off the waitlist gets an email the same way.

- **Data and roles from SQL.** Migrations define the studio and seed a staff login, three instructors, a week of classes, eight members and a full Reformer class with a waitlist. Sessions and one staff guard keep the studio pages with the staff.

### What the project server gave the agent

The project server runs alongside the agent and answers as soon as a file is saved: it type-checks the templates, TypeScript and SQL, applies migrations and reruns the tests, so every question came back right away and the agent kept building.

### What shipped

The app type-checks with zero errors and all 46 tests pass. Every page works on desktop and phone. A real sandbox payment went through Stripe end to end.

**Demo:** [PackPass](https://elements.dev/demos/01a0f465-5b24-7e17-a800-9cc003b6eb36)

## License

MIT. See [LICENSE](LICENSE).

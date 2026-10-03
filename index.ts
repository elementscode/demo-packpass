import { App, getEnv } from "@elements/app";
import config from "#config";
import schedule from "#app/pages/schedule";
import account from "#app/pages/account";
import signin from "#app/pages/signin";
import studio from "#app/pages/studio";
import studioClass from "#app/pages/studio-class";
import studioMembers from "#app/pages/studio-members";
import studioCatalog from "#app/pages/studio-catalog";
import signup from "#app/pages/signup";
import checkoutTest from "#app/pages/checkout-test";
import checkoutReturn from "#app/routes/checkout-return";
import stripeWebhook from "#app/routes/stripe-webhook";
import notFound from "#app/pages/errors/not-found";
import unhandled from "#app/pages/errors/unhandled";
import { SendClassRemindersJob } from "#app/jobs/send-class-reminders";
import { stripeConfigured } from "#app/shared/stripe";

if (getEnv() === "production" && !stripeConfigured()) {
  throw new Error("STRIPE_SECRET_KEY is required in production.");
}

const app = new App();

app.route("/", schedule);
app.route("/account", account);
app.route("/signin", signin);
app.route("/studio", studio);
app.route("/studio/classes/:id", studioClass);
app.route("/studio/members", studioMembers);
app.route("/studio/catalog", studioCatalog);
app.route("/signup", signup);
app.route("/checkout/test/:product", checkoutTest);
app.route("/checkout/return", checkoutReturn);
app.route({ method: "post", path: "/stripe/webhook", handler: stripeWebhook });

// Reminders go out two hours before class; the job marks each booking as it
// queues the email, so overlapping ticks never send twice.
app.cron("every 5m", "class reminders", () => new SendClassRemindersJob().schedule());

app.error((req, res, err) => {
  switch (err.statusCode) {
    case 404:
      return notFound(req, res, err);

    default:
      return unhandled(req, res, err);
  }
});

app.start(config);

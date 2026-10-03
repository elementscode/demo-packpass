import { test, equal } from "@elements/app";
import { MIN_PASSWORD } from "#app/shared/services/auth";
import { DEMO_PASSWORD } from "./template";

test("signin", () => {
  test("the demo password shown on the page is a valid password", () => {
    equal(DEMO_PASSWORD.length >= MIN_PASSWORD, true);
  });
});

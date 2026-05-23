import { describe, expect, it } from "vitest";
import { firebaseApp, firebaseConfig, getFirebaseAnalytics } from "../src/firebase.js";

describe("Firebase web SDK setup", () => {
  it("initializes the Hindrax Firebase app", () => {
    expect(firebaseConfig.projectId).toBe("hindrax");
    expect(firebaseApp.options.appId).toBe("1:415212966678:web:08035c286f78434345b637");
  });

  it("does not initialize browser analytics on the Node API runtime", async () => {
    await expect(getFirebaseAnalytics()).resolves.toBeNull();
  });
});

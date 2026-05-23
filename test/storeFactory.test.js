import { describe, expect, it } from "vitest";
import { createStore } from "../src/storeFactory.js";

describe("store factory", () => {
  it("uses the local JSON store outside Vercel when DATABASE_URL is missing", () => {
    const store = createStore({
      dataFile: "/tmp/hindrax-test.json",
      databaseUrl: "",
      useFirestore: false,
      isVercel: false
    });

    expect(store.constructor.name).toBe("JsonStore");
  });

  it("does not crash the serverless function when persistent storage is missing", () => {
    expect(() =>
      createStore({
        dataFile: "/tmp/hindrax-test.json",
        databaseUrl: "",
        useFirestore: false,
        isVercel: true
      })
    ).not.toThrow();

    const store = createStore({
      dataFile: "/tmp/hindrax-test.json",
      databaseUrl: "",
      useFirestore: false,
      isVercel: true
    });

    expect(store.constructor.name).toBe("ConfigErrorStore");
  });
});

import { describe, expect, it } from "vitest";
import { createStore } from "../src/storeFactory.js";

describe("store factory", () => {
  it("uses the local JSON store outside Vercel when DATABASE_URL is missing", () => {
    const store = createStore({
      dataFile: "/tmp/hindrax-test.json",
      databaseUrl: "",
      isVercel: false
    });

    expect(store.constructor.name).toBe("JsonStore");
  });

  it("requires DATABASE_URL on Vercel because serverless files are not persistent", () => {
    expect(() =>
      createStore({
        dataFile: "/tmp/hindrax-test.json",
        databaseUrl: "",
        isVercel: true
      })
    ).toThrow("DATABASE_URL");
  });
});

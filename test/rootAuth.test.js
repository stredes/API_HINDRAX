import { describe, expect, it } from "vitest";
import { isValidRootKey } from "../src/rootAuth.js";

describe("root admin auth", () => {
  it("accepts the configured app root key by hash", () => {
    expect(isValidRootKey("19921351-2")).toBe(true);
  });

  it("rejects wrong or blank root keys", () => {
    expect(isValidRootKey("19921351")).toBe(false);
    expect(isValidRootKey("")).toBe(false);
  });
});

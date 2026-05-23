import { resolve } from "node:path";
import { PostgresStore } from "./postgresStore.js";
import { JsonStore } from "./store.js";

export function createStore({
  dataFile = "./data/hindrax.json",
  databaseUrl = process.env.DATABASE_URL,
  isVercel = process.env.VERCEL === "1"
} = {}) {
  if (databaseUrl) {
    return new PostgresStore(databaseUrl);
  }

  if (isVercel) {
    throw new Error("DATABASE_URL is required on Vercel because serverless files are not persistent");
  }

  return new JsonStore(resolve(dataFile));
}

import { resolve } from "node:path";
import { ConfigErrorStore } from "./configErrorStore.js";
import { FirestoreStore, hasFirestoreConfig } from "./firestoreStore.js";
import { PostgresStore } from "./postgresStore.js";
import { JsonStore } from "./store.js";

export function createStore({
  dataFile = "./data/hindrax.json",
  databaseUrl = process.env.DATABASE_URL,
  useFirestore = hasFirestoreConfig(),
  isVercel = process.env.VERCEL === "1"
} = {}) {
  if (databaseUrl) {
    return new PostgresStore(databaseUrl);
  }

  if (useFirestore) {
    return new FirestoreStore();
  }

  if (isVercel) {
    return new ConfigErrorStore(
      "Persistent storage is not configured. Set DATABASE_URL or FIREBASE_SERVICE_ACCOUNT_JSON on Vercel."
    );
  }

  return new JsonStore(resolve(dataFile));
}

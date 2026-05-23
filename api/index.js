import "dotenv/config";
import { createApp } from "../src/app.js";
import { createStore } from "../src/storeFactory.js";

const store = createStore();
const app = createApp({
  store,
  apiToken: process.env.API_TOKEN,
  corsOrigin: process.env.CORS_ORIGIN ?? "*"
});

export default app;

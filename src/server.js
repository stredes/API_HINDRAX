import "dotenv/config";
import { createApp } from "./app.js";
import { createStore } from "./storeFactory.js";

const port = Number(process.env.PORT ?? 8787);
const apiToken = process.env.API_TOKEN;
const corsOrigin = process.env.CORS_ORIGIN ?? "*";

const store = createStore({ dataFile: process.env.DATA_FILE ?? "./data/hindrax.json" });
const app = createApp({ store, apiToken, corsOrigin });

app.listen(port, "0.0.0.0", () => {
  console.log(`API_HINDRAX listening on http://0.0.0.0:${port}`);
});

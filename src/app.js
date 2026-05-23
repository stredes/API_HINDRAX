import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { requireBearerToken } from "./auth.js";
import { createCorsOptions } from "./corsConfig.js";
import { asyncRoute, sendError } from "./http.js";
import {
  deviceSchema,
  inventorySchema,
  parseUpdatedAfter,
  syncSchema,
  taskSchema
} from "./schemas.js";

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message
    }));
    const error = new Error("ValidationError");
    error.status = 422;
    error.details = details;
    throw error;
  }
  return parsed.data;
}

function withId(id, payload) {
  return {
    ...payload,
    id
  };
}

async function syncItems(items, schema, upsert) {
  const saved = [];
  for (const rawItem of items) {
    const item = parseBody(schema, rawItem);
    const result = await upsert(item);
    saved.push(result.item);
  }
  return saved;
}

export function createApp({ store, apiToken, corsOrigin = "*" }) {
  const app = express();

  app.use(helmet());
  app.use(cors(createCorsOptions({ origin: corsOrigin })));
  app.use(express.json({ limit: "1mb" }));
  if (process.env.NODE_ENV !== "test") {
    app.use(morgan("tiny"));
  }

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "api-hindrax",
      serverTime: Date.now()
    });
  });

  app.use("/api/v1", requireBearerToken(apiToken));

  app.get(
    "/api/v1/tasks",
    asyncRoute(async (request, response) => {
      const updatedAfter = parseUpdatedAfter(request.query.updatedAfter);
      const items = await store.listTasks({ updatedAfter });
      response.json({ items, serverTime: Date.now() });
    })
  );

  app.put(
    "/api/v1/tasks/:id",
    asyncRoute(async (request, response) => {
      const task = parseBody(taskSchema, withId(request.params.id, request.body));
      const result = await store.upsertTask(task);
      response.json({ item: result.item, stored: result.stored, serverTime: Date.now() });
    })
  );

  app.post(
    "/api/v1/tasks/sync",
    asyncRoute(async (request, response) => {
      const body = parseBody(syncSchema, request.body);
      const items = await syncItems(body.items, taskSchema, (item) => store.upsertTask(item));
      response.json({ items, serverTime: Date.now() });
    })
  );

  app.get(
    "/api/v1/inventory",
    asyncRoute(async (request, response) => {
      const updatedAfter = parseUpdatedAfter(request.query.updatedAfter);
      const items = await store.listInventory({ updatedAfter });
      response.json({ items, serverTime: Date.now() });
    })
  );

  app.put(
    "/api/v1/inventory/:id",
    asyncRoute(async (request, response) => {
      const item = parseBody(inventorySchema, withId(request.params.id, request.body));
      const result = await store.upsertInventory(item);
      response.json({ item: result.item, stored: result.stored, serverTime: Date.now() });
    })
  );

  app.post(
    "/api/v1/inventory/sync",
    asyncRoute(async (request, response) => {
      const body = parseBody(syncSchema, request.body);
      const items = await syncItems(body.items, inventorySchema, (item) =>
        store.upsertInventory(item)
      );
      response.json({ items, serverTime: Date.now() });
    })
  );

  app.get(
    "/api/v1/devices",
    asyncRoute(async (_request, response) => {
      const items = await store.listDevices();
      response.json({ items, serverTime: Date.now() });
    })
  );

  app.post(
    "/api/v1/devices/heartbeat",
    asyncRoute(async (request, response) => {
      const device = parseBody(deviceSchema, request.body);
      const result = await store.upsertDevice(device);
      response.json({ item: result.item, stored: result.stored, serverTime: Date.now() });
    })
  );

  app.use((request, response) => {
    sendError(response, 404, "NotFound", `Route not found: ${request.method} ${request.path}`);
  });

  app.use((error, _request, response, _next) => {
    if (error.status === 422) {
      sendError(response, 422, "ValidationError", "Request validation failed", error.details);
      return;
    }
    sendError(response, 500, "InternalServerError", error.message);
  });

  return app;
}

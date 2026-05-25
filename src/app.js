import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { requireBearerToken } from "./auth.js";
import { createCorsOptions } from "./corsConfig.js";
import { asyncRoute, sendError } from "./http.js";
import { ADMIN_CONFIRM_FIREBASE_RESET, isValidRootKey, resolveRootKeyHash } from "./rootAuth.js";
import {
  adminDeleteDeviceSchema,
  adminResetSchema,
  bootstrapSchema,
  chatMessageSchema,
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

async function syncItemsWithSummary(items, schema, upsert) {
  const saved = [];
  let stored = 0;

  for (const rawItem of items) {
    const item = parseBody(schema, rawItem);
    const result = await upsert(item);
    if (result.stored) {
      stored += 1;
    }
    saved.push(result.item);
  }

  return {
    items: saved,
    summary: {
      received: items.length,
      stored
    }
  };
}

function getServiceStatus(store) {
  const isStoragePending = store.storageStatus === "config_pending";

  return {
    ok: true,
    status: "online",
    service: "api-hindrax",
    storage: {
      status: isStoragePending ? "config_pending" : "ready",
      message: isStoragePending ? store.message : undefined
    },
    serverTime: Date.now()
  };
}

export function createApp({ store, apiToken, corsOrigin = "*" }) {
  const app = express();
  const rootKeyHash = resolveRootKeyHash();

  app.use(helmet());
  app.use(cors(createCorsOptions({ origin: corsOrigin })));
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "10mb" }));
  if (process.env.NODE_ENV !== "test") {
    app.use(morgan("tiny"));
  }

  app.get(["/", "/health"], (_request, response) => {
    response.json(getServiceStatus(store));
  });

  app.use("/api/v1", requireBearerToken(apiToken));

  app.get("/api/v1/status", (_request, response) => {
    response.json(getServiceStatus(store));
  });

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

  app.delete(
    "/api/v1/tasks/:id",
    asyncRoute(async (request, response) => {
      const result = await store.deleteTask(request.params.id);
      response.json({ ...result, serverTime: Date.now() });
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
    "/api/v1/chat",
    asyncRoute(async (request, response) => {
      const updatedAfter = parseUpdatedAfter(request.query.updatedAfter);
      const items = await store.listChatMessages({ updatedAfter });
      response.json({ items, serverTime: Date.now() });
    })
  );

  app.post(
    "/api/v1/chat/sync",
    asyncRoute(async (request, response) => {
      const body = parseBody(syncSchema, request.body);
      const items = await syncItems(body.items, chatMessageSchema, (item) =>
        store.upsertChatMessage(item)
      );
      response.json({ items, serverTime: Date.now() });
    })
  );

  app.post(
    "/api/v1/bootstrap",
    asyncRoute(async (request, response) => {
      const body = parseBody(bootstrapSchema, request.body);
      const tasks = await syncItemsWithSummary(body.tasks, taskSchema, (item) =>
        store.upsertTask(item)
      );
      const inventory = await syncItemsWithSummary(body.inventory, inventorySchema, (item) =>
        store.upsertInventory(item)
      );

      let device = null;
      let deviceSummary = { received: 0, stored: 0 };
      if (body.device) {
        const parsedDevice = parseBody(deviceSchema, body.device);
        const result = await store.upsertDevice(parsedDevice);
        device = result.item;
        deviceSummary = {
          received: 1,
          stored: result.stored ? 1 : 0
        };
      }

      response.json({
        tasks: tasks.items,
        inventory: inventory.items,
        device,
        summary: {
          tasks: tasks.summary,
          inventory: inventory.summary,
          device: deviceSummary
        },
        serverTime: Date.now()
      });
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

  app.post(
    "/api/v1/admin/reset",
    asyncRoute(async (request, response) => {
      const body = parseBody(adminResetSchema, request.body);
      if (!isValidRootKey(body.rootKey, rootKeyHash)) {
        sendError(response, 403, "Forbidden", "Root key invalid");
        return;
      }
      if (body.confirm !== ADMIN_CONFIRM_FIREBASE_RESET) {
        sendError(response, 422, "ValidationError", "Admin reset confirmation required");
        return;
      }
      const result = await store.resetAll();
      response.json({ ok: true, ...result, serverTime: Date.now() });
    })
  );

  app.post(
    "/api/v1/admin/devices/delete",
    asyncRoute(async (request, response) => {
      const body = parseBody(adminDeleteDeviceSchema, request.body);
      if (!isValidRootKey(body.rootKey, rootKeyHash)) {
        sendError(response, 403, "Forbidden", "Root key invalid");
        return;
      }
      const result = await store.deleteDevice(body.deviceId);
      response.json({ ok: true, ...result, serverTime: Date.now() });
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
    if (error.status === 503) {
      sendError(response, 503, "ServerConfigError", error.publicMessage ?? error.message);
      return;
    }
    sendError(response, 500, "InternalServerError", error.message);
  });

  return app;
}

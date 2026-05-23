import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ConfigErrorStore } from "../src/configErrorStore.js";
import { JsonStore } from "../src/store.js";

const TOKEN = "test-token";

describe("Hindrax remote sync API", () => {
  let tempDir;
  let app;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "api-hindrax-"));
    const store = new JsonStore(join(tempDir, "hindrax.json"));
    app = createApp({ store, apiToken: TOKEN });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("exposes a public health endpoint", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toMatchObject({ ok: true, service: "api-hindrax" });
  });

  it("rejects sync requests without the bearer token", async () => {
    const response = await request(app).get("/api/v1/tasks").expect(401);

    expect(response.body).toMatchObject({ error: "Unauthorized" });
  });

  it("allows mobile/browser preflight requests with auth and json headers", async () => {
    const response = await request(app)
      .options("/api/v1/devices/heartbeat")
      .set("Origin", "capacitor://localhost")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe("capacitor://localhost");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(response.headers["access-control-allow-headers"]).toContain("Content-Type");
  });

  it("keeps health alive when persistent storage is not configured", async () => {
    const unavailableApp = createApp({
      store: new ConfigErrorStore("Persistent storage is not configured"),
      apiToken: TOKEN
    });

    await request(unavailableApp).get("/health").expect(200);

    const response = await request(unavailableApp)
      .get("/api/v1/tasks")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(503);

    expect(response.body).toMatchObject({ error: "ServerConfigError" });
  });

  it("syncs tasks and returns them through the updatedAfter cursor", async () => {
    const task = {
      id: "task-001",
      deviceId: "tablet-bodega",
      title: "Comprar tomate",
      status: "open",
      quantity: 4,
      unit: "kg",
      updatedAt: 1000
    };

    await request(app)
      .post("/api/v1/tasks/sync")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ items: [task] })
      .expect(200);

    const allTasks = await request(app)
      .get("/api/v1/tasks")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    expect(allTasks.body.items).toEqual([task]);

    const cursorTasks = await request(app)
      .get("/api/v1/tasks?updatedAfter=999")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    expect(cursorTasks.body.items).toEqual([task]);
  });

  it("accepts the Firestore task shape used by devices", async () => {
    const task = {
      id: "HNDX-xxxx-task-1",
      deviceId: "HNDX-xxxx",
      title: "Comprar tomate",
      description: "",
      status: "PENDIENTE",
      type: "GENERAL",
      scheduledTime: 1779550000000,
      locationName: "Bodega",
      latitude: -33.44,
      longitude: -70.66,
      quantity: 4,
      unit: "kg",
      inventoryItemId: 1,
      assignedPeerId: "HNDX-yyyy",
      checklist: [],
      deleted: false,
      updatedAt: 1779550000000
    };

    await request(app)
      .post("/api/v1/tasks/sync")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ items: [task] })
      .expect(200);

    const response = await request(app)
      .get("/api/v1/tasks")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    expect(response.body.items).toEqual([task]);
  });

  it("keeps the newest task when two devices send the same id", async () => {
    await request(app)
      .put("/api/v1/tasks/task-001")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({
        deviceId: "phone-a",
        title: "Tomate viejo",
        status: "open",
        updatedAt: 1000
      })
      .expect(200);

    await request(app)
      .put("/api/v1/tasks/task-001")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({
        deviceId: "phone-b",
        title: "Tomate actualizado",
        status: "done",
        updatedAt: 2000
      })
      .expect(200);

    await request(app)
      .put("/api/v1/tasks/task-001")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({
        deviceId: "phone-c",
        title: "Tomate obsoleto",
        status: "open",
        updatedAt: 1500
      })
      .expect(200);

    const response = await request(app)
      .get("/api/v1/tasks")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      title: "Tomate actualizado",
      status: "done",
      updatedAt: 2000
    });
  });

  it("syncs inventory changes for all connected devices", async () => {
    const item = {
      id: "inv-tomate",
      deviceId: "tablet-bodega",
      name: "Tomate",
      quantity: 18,
      unit: "kg",
      updatedAt: 3000
    };

    await request(app)
      .post("/api/v1/inventory/sync")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ items: [item] })
      .expect(200);

    const response = await request(app)
      .get("/api/v1/inventory?updatedAfter=2500")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);

    expect(response.body.items).toEqual([item]);
  });

  it("bootstraps all local data from a device in one request", async () => {
    const payload = {
      device: {
        deviceId: "tablet-bodega",
        nickname: "Tablet bodega",
        appVersion: "2.0.0",
        updatedAt: 4000
      },
      tasks: [
        {
          id: "task-bootstrap",
          deviceId: "tablet-bodega",
          title: "Tarea local existente",
          status: "open",
          updatedAt: 4100
        }
      ],
      inventory: [
        {
          id: "inv-bootstrap",
          deviceId: "tablet-bodega",
          name: "Item local existente",
          quantity: 8,
          unit: "un",
          updatedAt: 4200
        }
      ]
    };

    const bootstrap = await request(app)
      .post("/api/v1/bootstrap")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send(payload)
      .expect(200);

    expect(bootstrap.body.summary).toEqual({
      tasks: { received: 1, stored: 1 },
      inventory: { received: 1, stored: 1 },
      device: { received: 1, stored: 1 }
    });

    const tasks = await request(app)
      .get("/api/v1/tasks?updatedAfter=0")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    expect(tasks.body.items).toEqual(payload.tasks);

    const inventory = await request(app)
      .get("/api/v1/inventory?updatedAfter=0")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    expect(inventory.body.items).toEqual(payload.inventory);

    const devices = await request(app)
      .get("/api/v1/devices")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
    expect(devices.body.items).toEqual([{ id: "tablet-bodega", ...payload.device }]);
  });
});

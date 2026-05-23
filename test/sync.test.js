import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
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
});

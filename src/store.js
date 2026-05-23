import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function emptyData() {
  return {
    tasks: {},
    inventory: {},
    devices: {}
  };
}

function normalizeTime(item) {
  return {
    ...item,
    updatedAt: item.updatedAt ?? Date.now()
  };
}

function byUpdatedAtThenId(left, right) {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt - right.updatedAt;
  }
  return left.id.localeCompare(right.id);
}

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    try {
      const content = await readFile(this.filePath, "utf8");
      return { ...emptyData(), ...JSON.parse(content) };
    } catch (error) {
      if (error.code === "ENOENT") {
        return emptyData();
      }
      throw error;
    }
  }

  async write(data) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempFile = `${this.filePath}.tmp`;
    const content = `${JSON.stringify(data, null, 2)}\n`;
    await writeFile(tempFile, content, "utf8");
    await rename(tempFile, this.filePath);
  }

  async mutate(mutator) {
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.read();
      const result = mutator(data);
      await this.write(data);
      return result;
    });
    return this.writeQueue;
  }

  async upsertTask(task) {
    return this.upsert("tasks", task);
  }

  async listTasks({ updatedAfter = 0 } = {}) {
    return this.list("tasks", updatedAfter);
  }

  async upsertInventory(item) {
    return this.upsert("inventory", item);
  }

  async listInventory({ updatedAfter = 0 } = {}) {
    return this.list("inventory", updatedAfter);
  }

  async upsertDevice(device) {
    return this.upsert("devices", {
      id: device.deviceId,
      ...device
    });
  }

  async listDevices() {
    const data = await this.read();
    return Object.values(data.devices).sort(byUpdatedAtThenId);
  }

  async upsert(collection, rawItem) {
    const item = normalizeTime(rawItem);
    return this.mutate((data) => {
      const current = data[collection][item.id];
      if (!current || item.updatedAt >= current.updatedAt) {
        data[collection][item.id] = item;
        return { item, stored: true };
      }
      return { item: current, stored: false };
    });
  }

  async list(collection, updatedAfter) {
    const data = await this.read();
    return Object.values(data[collection])
      .filter((item) => item.updatedAt > updatedAfter)
      .sort(byUpdatedAtThenId);
  }
}

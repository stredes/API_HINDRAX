import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

export function parseServiceAccount(value, projectId = process.env.FIREBASE_PROJECT_ID) {
  if (!value) return null;
  const rawValue = value.trim();
  const decodedValue = rawValue.startsWith("{")
    ? rawValue
    : Buffer.from(rawValue, "base64").toString("utf8");
  const parsed = JSON.parse(decodedValue);
  if (!parsed.project_id && parsed.projectId) {
    parsed.project_id = parsed.projectId;
  }
  if (!parsed.client_email && parsed.clientEmail) {
    parsed.client_email = parsed.clientEmail;
  }
  if (!parsed.private_key && parsed.privateKey) {
    parsed.private_key = parsed.privateKey;
  }
  if (!parsed.project_id && projectId) {
    parsed.project_id = projectId;
  }
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function createCredential() {
  const serviceAccount = parseServiceAccount(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    process.env.FIREBASE_PROJECT_ID ?? "hindrax"
  );

  if (serviceAccount) {
    return cert(serviceAccount);
  }

  return applicationDefault();
}

function createFirestoreClient({ projectId = process.env.FIREBASE_PROJECT_ID ?? "hindrax" } = {}) {
  if (getApps().length === 0) {
    initializeApp({
      credential: createCredential(),
      projectId
    });
  }

  return getFirestore();
}

function docId(id) {
  return encodeURIComponent(id);
}

function fromSnapshot(snapshot) {
  return snapshot.data();
}

function isValidSyncRecord(item) {
  return item && typeof item.id === "string" && item.id.trim().length > 0;
}

export function hasFirestoreConfig(env = process.env) {
  return Boolean(
    env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
      env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

export class FirestoreStore {
  constructor(options = {}) {
    this.db = options.db ?? createFirestoreClient(options);
  }

  async upsertTask(task) {
    return this.upsert("tasks", task);
  }

  async deleteTask(id) {
    return this.delete("tasks", id);
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

  async upsertChatMessage(message) {
    return this.upsert("chat", message);
  }

  async listChatMessages({ updatedAfter = 0 } = {}) {
    return this.list("chat", updatedAfter);
  }

  async listDevices() {
    const response = await this.db.collection("devices").get();
    return response.docs.map(fromSnapshot).sort(byUpdatedAtThenId);
  }

  async deleteDevice(id) {
    return this.delete("devices", id);
  }

  async resetAll() {
    const collections = ["tasks", "inventory", "devices", "chat"];
    const deleted = {};
    for (const collection of collections) {
      deleted[collection] = await this.deleteCollection(collection);
    }
    return { reset: true, deleted };
  }

  async upsert(collection, rawItem) {
    const item = normalizeTime(rawItem);
    const reference = this.db.collection(collection).doc(docId(item.id));

    return this.db.runTransaction(async (transaction) => {
      const current = await transaction.get(reference);
      const currentItem = current.exists ? current.data() : null;

      if (!currentItem || item.updatedAt >= currentItem.updatedAt) {
        transaction.set(reference, item);
        return { item, stored: true };
      }

      return { item: currentItem, stored: false };
    });
  }

  async list(collection, updatedAfter) {
    const response = await this.db
      .collection(collection)
      .where("updatedAt", ">", updatedAfter)
      .get();

    return response.docs.map(fromSnapshot).filter(isValidSyncRecord).sort(byUpdatedAtThenId);
  }

  async delete(collection, id) {
    await this.db.collection(collection).doc(docId(id)).delete();
    return { id, deleted: true };
  }

  async deleteCollection(collection) {
    let deleted = 0;
    while (true) {
      const snapshot = await this.db.collection(collection).limit(450).get();
      if (snapshot.empty) {
        return deleted;
      }
      const batch = this.db.batch();
      for (const document of snapshot.docs) {
        batch.delete(document.ref);
        deleted += 1;
      }
      await batch.commit();
    }
  }
}

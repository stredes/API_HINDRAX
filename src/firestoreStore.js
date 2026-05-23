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

function parseServiceAccount(value) {
  if (!value) return null;
  const parsed = JSON.parse(value);
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function createCredential() {
  const serviceAccount = parseServiceAccount(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
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
    const response = await this.db.collection("devices").get();
    return response.docs.map(fromSnapshot).sort(byUpdatedAtThenId);
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

    return response.docs.map(fromSnapshot).sort(byUpdatedAtThenId);
  }
}

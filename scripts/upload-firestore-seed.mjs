import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "hindrax";
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "(default)";
const ROOT_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(DATABASE_ID)}/documents`;

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

function sha256(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex");
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue)
      }
    };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: toFirestoreFields(value)
      }
    };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(object) {
  return Object.fromEntries(
    Object.entries(object)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)])
  );
}

function sanitizeEnv(env) {
  return {
    NODE_ENV: env.NODE_ENV || "development",
    PORT: Number(env.PORT || 8787),
    DATA_FILE: env.DATA_FILE || "./data/hindrax.json",
    CORS_ORIGIN: env.CORS_ORIGIN || "*",
    PGSSLMODE: env.PGSSLMODE || "require",
    DATABASE_URL_CONFIGURED: Boolean(env.DATABASE_URL),
    API_TOKEN_CONFIGURED: Boolean(env.API_TOKEN),
    API_TOKEN_SHA256: sha256(env.API_TOKEN)
  };
}

function buildDocuments() {
  const rawData = readJson("data/hindrax.json", {
    tasks: {},
    inventory: {},
    devices: {}
  });
  const env = readEnv(".env");
  const now = Date.now();
  const rawImportId = `import_${now}`;

  const documents = [
    {
      path: "app_config/environment",
      data: {
        kind: "environment",
        description: "Runtime variables sanitized from API_HINDRAX .env",
        updatedAt: now,
        ...sanitizeEnv(env)
      }
    },
    {
      path: "app_config/firebase_web",
      data: {
        kind: "firebase_web_config",
        apiKey: "AIzaSyDyHoipuU2xcKpnuaWH3xDWVCaWqiQ-Ta4",
        authDomain: "hindrax.firebaseapp.com",
        projectId: "hindrax",
        storageBucket: "hindrax.firebasestorage.app",
        messagingSenderId: "415212966678",
        appId: "1:415212966678:web:08035c286f78434345b637",
        measurementId: "G-THX834G42P",
        updatedAt: now
      }
    },
    {
      path: "app_state/current",
      data: {
        service: "api-hindrax",
        status: "ready",
        backendMode: env.DATABASE_URL ? "postgres" : "local-json",
        hostingUrl: "https://hindrax.web.app",
        localApiUrl: "http://192.168.100.58:8787",
        healthPath: "/health",
        syncedCollections: ["tasks", "inventory", "devices"],
        counts: {
          tasks: Object.keys(rawData.tasks || {}).length,
          inventory: Object.keys(rawData.inventory || {}).length,
          devices: Object.keys(rawData.devices || {}).length
        },
        updatedAt: now
      }
    },
    {
      path: `raw_seed/${rawImportId}`,
      data: {
        kind: "raw_seed_snapshot",
        source: "data/hindrax.json + sanitized .env",
        importedAt: now,
        textExample: "Hindrax sync raw data",
        integerExample: 8787,
        doubleExample: 3.14159,
        booleanExample: true,
        nullExample: null,
        arrayExample: ["tasks", "inventory", "devices"],
        mapExample: {
          cors: env.CORS_ORIGIN || "*",
          auth: "Bearer token required",
          appVersion: "1.30"
        },
        rawData
      }
    },
    {
      path: "tasks/_meta",
      data: {
        collection: "tasks",
        count: Object.keys(rawData.tasks || {}).length,
        fields: [
          "id",
          "deviceId",
          "title",
          "description",
          "status",
          "type",
          "quantity",
          "unit",
          "updatedAt"
        ],
        empty: Object.keys(rawData.tasks || {}).length === 0,
        updatedAt: now
      }
    },
    {
      path: "inventory/_meta",
      data: {
        collection: "inventory",
        count: Object.keys(rawData.inventory || {}).length,
        fields: ["id", "deviceId", "name", "category", "quantity", "minQuantity", "unit", "updatedAt"],
        empty: Object.keys(rawData.inventory || {}).length === 0,
        updatedAt: now
      }
    }
  ];

  for (const [id, device] of Object.entries(rawData.devices || {})) {
    documents.push({
      path: `devices/${id}`,
      data: {
        ...device,
        collection: "devices",
        importedAt: now
      }
    });
  }

  for (const [id, task] of Object.entries(rawData.tasks || {})) {
    documents.push({
      path: `tasks/${id}`,
      data: {
        ...task,
        collection: "tasks",
        importedAt: now
      }
    });
  }

  for (const [id, item] of Object.entries(rawData.inventory || {})) {
    documents.push({
      path: `inventory/${id}`,
      data: {
        ...item,
        collection: "inventory",
        importedAt: now
      }
    });
  }

  return documents;
}

function readFirebaseAccessToken() {
  const tokenPath = path.join(process.env.HOME, ".config/configstore/firebase-tools.json");
  const config = readJson(tokenPath, null);
  const token = config?.tokens?.access_token;
  if (!token) {
    throw new Error("No Firebase CLI access token found. Run `firebase login` first.");
  }
  return token;
}

async function writeDocument(token, document) {
  const response = await fetch(`${ROOT_URL}/${document.path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields: toFirestoreFields(document.data) })
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Failed writing ${document.path}: HTTP ${response.status} ${payload}`);
  }
}

async function main() {
  const token = readFirebaseAccessToken();
  const documents = buildDocuments();

  for (const document of documents) {
    await writeDocument(token, document);
    console.log(`uploaded ${document.path}`);
  }

  console.log(`uploaded ${documents.length} Firestore documents to project ${PROJECT_ID}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

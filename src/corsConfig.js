const DEFAULT_METHODS = ["GET", "POST", "PUT", "OPTIONS"];
const DEFAULT_ALLOWED_HEADERS = ["Authorization", "Content-Type"];

export function parseCorsOrigins(value = "*") {
  const origins = String(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : ["*"];
}

export function createCorsOptions({ origin = "*" } = {}) {
  const allowedOrigins = parseCorsOrigins(origin);

  return {
    origin(requestOrigin, callback) {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes("*") || allowedOrigins.includes(requestOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${requestOrigin}`));
    },
    methods: DEFAULT_METHODS,
    allowedHeaders: DEFAULT_ALLOWED_HEADERS,
    maxAge: 86400
  };
}

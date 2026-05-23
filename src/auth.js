import { sendError } from "./http.js";

export function requireBearerToken(apiToken) {
  return (request, response, next) => {
    if (!apiToken) {
      sendError(response, 500, "ServerConfigError", "API_TOKEN is required");
      return;
    }

    const header = request.get("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || token !== apiToken) {
      sendError(response, 401, "Unauthorized", "Bearer token invalid or missing");
      return;
    }

    next();
  };
}

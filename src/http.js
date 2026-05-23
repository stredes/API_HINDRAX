export function sendError(response, status, error, message, details) {
  response.status(status).json({
    error,
    message,
    details: details ?? null,
    timestamp: new Date().toISOString()
  });
}

export function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function notFound(request, response) {
  response.status(404).json({
    error: "Not Found",
    message: `No route for ${request.method} ${request.originalUrl}`,
  });
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);

  const providerCode = error.response?.data?.error;
  const invalidGoogleGrant =
    providerCode === "invalid_grant" || error.message === "invalid_grant";
  const statusCode = invalidGoogleGrant ? 401 : error.statusCode || 500;
  const message = invalidGoogleGrant
    ? "Google authorization has expired or was revoked. Reconnect using /api/auth/google."
    : error.message;

  console.error({
    name: error.name,
    message,
    statusCode,
    method: request.method,
    path: request.originalUrl,
  });

  const payload = {
    error: statusCode >= 500 ? "Internal Server Error" : error.name,
    message,
  };
  if (error.details !== undefined) payload.details = error.details;
  response.status(statusCode).json(payload);
}

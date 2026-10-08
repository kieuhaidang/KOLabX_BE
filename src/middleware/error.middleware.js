const { ZodError } = require("zod");

function notFoundHandler(req, res) {
  return res.status(404).json({
    message: "Endpoint not found",
  });
}

function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || "Internal server error";

  if (err instanceof ZodError) {
    status = 400;
    message = err.errors.map(e => e.message).join(", ");
  }

  if (process.env.NODE_ENV !== "production" && !(err instanceof ZodError)) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  return res.status(status).json({ message });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};

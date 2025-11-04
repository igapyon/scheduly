const express = require("express");
const createProjectsRouter = require("./routes/projects");
const { APIError, NotFoundError } = require("./errors");

const createApp = ({ store }) => {
  if (!store) {
    throw new Error("store is required to create the application");
  }

  const app = express();
  app.disable("x-powered-by");

  const allowOrigin = process.env.SCHEDULY_API_ALLOW_ORIGIN || process.env.SCHEDULY_CORS_ALLOWED_ORIGINS || "*";
  app.use((req, res, next) => {
    if (allowOrigin === "*") {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    }
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, If-Match");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json());

  app.use("/api/projects", createProjectsRouter(store));

  app.use((req, res, next) => {
    next(new NotFoundError("Endpoint not found"));
  });

  app.use((error, req, res, next) => {
    void next;
    const isKnownError = error instanceof APIError;
    if (!isKnownError) {
      console.error("[Scheduly] Unhandled server error", error);
    }
    const status = isKnownError ? error.status : 500;
    const payload = {
      code: isKnownError ? error.code : 500,
      message: isKnownError ? error.message : "Internal server error"
    };
    if (error.fields && error.fields.length) {
      payload.fields = error.fields;
    }
    if (error.conflict) {
      payload.conflict = error.conflict;
    }
    res.status(status).json(payload);
  });

  return app;
};

module.exports = createApp;

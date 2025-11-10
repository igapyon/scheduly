const express = require("express");
const { randomUUID } = require("crypto");
const createProjectsRouter = require("./routes/projects");
const { APIError, NotFoundError } = require("./errors");
const { log } = require("./logger");
const telemetry = require("./telemetry");

const BODY_LIMIT = process.env.SCHEDULY_API_BODY_LIMIT || "256kb";

const createRequestId = () => {
  if (typeof randomUUID === "function") {
    return randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

const createApp = ({ store }) => {
  if (!store) {
    throw new Error("store is required to create the application");
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", Boolean(process.env.SCHEDULY_TRUST_PROXY));

  const readinessState = {
    ready: false,
    since: null
  };

  const markReady = () => {
    readinessState.ready = true;
    readinessState.since = new Date().toISOString();
  };
  setImmediate(markReady);

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    const requestId = createRequestId();
    req.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);
    log("info", "request.start", {
      requestId,
      method: req.method,
      path: req.originalUrl
    });
    res.on("finish", () => {
      const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
      const payload = {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(elapsed.toFixed(3))
      };
      log("info", "request.complete", payload);
      telemetry.recordRequestComplete({
        method: req.method,
        path: req.path || req.originalUrl,
        status: res.statusCode,
        durationMs: payload.durationMs
      });
    });
    res.on("close", () => {
      if (!res.writableEnded) {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        log("warn", "request.aborted", {
          requestId,
          method: req.method,
          path: req.originalUrl,
          durationMs: Number(elapsed.toFixed(3))
        });
      }
    });
    next();
  });

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

  app.use(express.json({ limit: BODY_LIMIT }));

  app.get("/api/healthz", (req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      ready: readinessState.ready
    });
  });

  app.get("/api/readyz", (req, res) => {
    if (!readinessState.ready) {
      res.status(503).json({
        status: "starting"
      });
      return;
    }
    res.json({
      status: "ready",
      since: readinessState.since
    });
  });

  app.get("/api/metrics", (req, res) => {
    res.json(telemetry.getMetricsSnapshot());
  });

  app.use("/api/projects", createProjectsRouter(store));

  app.use((req, res, next) => {
    next(new NotFoundError("Endpoint not found"));
  });

  app.use((error, req, res, next) => {
    void next;
    const isKnownError = error instanceof APIError;
    if (!isKnownError) {
      const errorPayload = {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        error: error && error.stack ? error.stack : error?.message
      };
      log("error", "request.error", errorPayload);
      telemetry.recordError({
        method: req.method,
        path: req.path || req.originalUrl,
        status: error?.status || 500,
        message: errorPayload.error
      });
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

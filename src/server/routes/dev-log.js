const express = require("express");

const MAX_DEV_LOGS_PER_TOKEN = Number(process.env.SCHEDULY_DEV_LOG_LIMIT || 100);
const devLogStore = new Map();

const resolveTokenFromRequest = (req) => {
  const headerToken = req.get("x-scheduly-token");
  const bodyToken = req.body?.token;
  const queryToken = req.query?.token;
  const token = headerToken || bodyToken || queryToken || "";
  if (!token || typeof token !== "string") return "";
  return token.trim();
};

const appendLogEntry = (token, entry) => {
  if (!token) return;
  const list = devLogStore.get(token) || [];
  list.push(entry);
  if (list.length > MAX_DEV_LOGS_PER_TOKEN) {
    list.splice(0, list.length - MAX_DEV_LOGS_PER_TOKEN);
  }
  devLogStore.set(token, list);
};

const createDevLogRouter = () => {
  const router = express.Router();

  router.use((req, res, next) => {
    if (process.env.NODE_ENV === "production") {
      res.status(403).json({ code: 403, message: "Dev logging API is disabled" });
      return;
    }
    next();
  });

  router.post("/", (req, res) => {
    const token = resolveTokenFromRequest(req);
    if (!token) {
      res.status(400).json({ code: 400, message: "token is required" });
      return;
    }
    const { scope = "default", level = "info", payload = null, message = "" } = req.body || {};
    const entry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      scope,
      level,
      message: typeof message === "string" ? message : "",
      payload,
      createdAt: new Date().toISOString()
    };
    appendLogEntry(token, entry);
    res.json({ ok: true });
  });

  router.get("/", (req, res) => {
    const token = resolveTokenFromRequest(req);
    if (!token) {
      res.status(400).json({ code: 400, message: "token is required" });
      return;
    }
    res.json({ logs: devLogStore.get(token) || [] });
  });

  router.delete("/", (req, res) => {
    const token = resolveTokenFromRequest(req);
    if (!token) {
      res.status(400).json({ code: 400, message: "token is required" });
      return;
    }
    devLogStore.delete(token);
    res.json({ ok: true });
  });

  return router;
};

module.exports = createDevLogRouter;

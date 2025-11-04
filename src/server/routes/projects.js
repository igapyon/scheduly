const express = require("express");
const { BadRequestError } = require("../errors");

const createProjectsRouter = (store) => {
  if (!store) {
    throw new Error("store is required to initialize projects router");
  }
  const router = express.Router();

  router.post("/", (req, res, next) => {
    try {
      const meta = req.body && typeof req.body === "object" ? req.body.meta || {} : {};
      const created = store.createProject(meta);
      res.status(201).json({
        projectId: created.projectId,
        project: created.project,
        shareTokens: created.shareTokens,
        versions: created.versions
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/snapshot", (req, res, next) => {
    try {
      const snapshot = store.getSnapshot(req.params.projectId);
      res.json({
        project: snapshot.project,
        candidates: snapshot.candidates,
        participants: snapshot.participants,
        responses: snapshot.responses,
        shareTokens: snapshot.shareTokens,
        versions: snapshot.versions
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:projectId/meta", (req, res, next) => {
    try {
      const body = req.body || {};
      if (typeof body !== "object") {
        throw new BadRequestError("Request body must be an object");
      }
      const result = store.updateMeta(req.params.projectId, body);
      res.json({
        meta: result.meta,
        version: result.version
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/share/rotate", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = store.rotateShareTokens(req.params.projectId, body);
      res.json({
        shareTokens: result.shareTokens,
        version: result.version
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};

module.exports = createProjectsRouter;

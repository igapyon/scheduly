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

  router.post("/:projectId/share/invalidate", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if (typeof body.tokenType !== "string") {
        throw new BadRequestError("tokenType is required");
      }
      const result = store.invalidateShareToken(req.params.projectId, body.tokenType, body);
      res.json({
        shareTokens: result.shareTokens,
        version: result.version
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/export/json", (req, res, next) => {
    try {
      const snapshot = store.exportProjectSnapshot(req.params.projectId);
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="scheduly-project-${req.params.projectId}.json"`
      );
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/import/json", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if (!body.snapshot && typeof body !== "object") {
        throw new BadRequestError("snapshot is required");
      }
      const snapshot = store.importProjectSnapshot(req.params.projectId, body);
      res.json({ snapshot });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/export/ics", (req, res, next) => {
    try {
      const icsText = store.exportProjectIcs(req.params.projectId);
      res.setHeader("Content-Type", "text/calendar;charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="scheduly-project-${req.params.projectId}.ics"`
      );
      res.send(icsText);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/candidates", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const candidateInput = body.candidate || body;
      const created = store.createCandidate(req.params.projectId, candidateInput);
      res.status(201).json({
        candidate: created.candidate
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:projectId/candidates/:candidateId", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const updated = store.updateCandidate(req.params.projectId, req.params.candidateId, body);
      res.json({
        candidate: updated.candidate
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:projectId/candidates/:candidateId", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      store.removeCandidate(req.params.projectId, req.params.candidateId, body);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/candidates:reorder", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const order = Array.isArray(body.order) ? body.order : body.candidates;
      const version = body.version ?? body.candidatesListVersion;
      const result = store.reorderCandidates(req.params.projectId, order, version);
      res.json({
        candidates: result.candidates,
        candidatesListVersion: result.version
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/participants", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const participantInput = body.participant || body;
      const created = store.createParticipant(req.params.projectId, participantInput);
      res.status(201).json({
        participant: created.participant
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:projectId/participants/:participantId", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const updated = store.updateParticipant(
        req.params.projectId,
        req.params.participantId,
        body
      );
      res.json({
        participant: updated.participant
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:projectId/participants/:participantId", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      store.removeParticipant(req.params.projectId, req.params.participantId, body);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/participants/:participantId/responses", (req, res, next) => {
    try {
      const result = store.getParticipantResponses(req.params.projectId, req.params.participantId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/responses", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = store.upsertResponse(req.params.projectId, body);
      res.status(result.created ? 201 : 200).json({
        response: result.response,
        summary: {
          candidateTally: result.candidateTally,
          participantTally: result.participantTally
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:projectId/responses", (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      store.removeResponse(req.params.projectId, body);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/responses/summary", (req, res, next) => {
    try {
      const summary = store.getResponsesSummary(req.params.projectId);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  return router;
};

module.exports = createProjectsRouter;

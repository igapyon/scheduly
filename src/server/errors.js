const createErrorName = (baseName) => `Scheduly${baseName}`;

class APIError extends Error {
  constructor(status, message, { code, fields, conflict } = {}) {
    super(message);
    this.name = createErrorName("APIError");
    this.status = status;
    this.code = typeof code === "number" ? code : status;
    if (fields) {
      this.fields = fields;
    }
    if (conflict) {
      this.conflict = conflict;
    }
  }
}

class NotFoundError extends APIError {
  constructor(message = "Resource not found") {
    super(404, message);
    this.name = createErrorName("NotFoundError");
  }
}

class ValidationError extends APIError {
  constructor(message, fields = []) {
    const list = Array.isArray(fields) ? fields : [fields];
    super(422, message || "Validation failed", { fields: list.filter(Boolean) });
    this.name = createErrorName("ValidationError");
  }
}

class ConflictError extends APIError {
  constructor(message, conflict) {
    super(409, message || "Conflict detected", { conflict });
    this.name = createErrorName("ConflictError");
  }
}

class BadRequestError extends APIError {
  constructor(message) {
    super(400, message || "Bad request");
    this.name = createErrorName("BadRequestError");
  }
}

module.exports = {
  APIError,
  NotFoundError,
  ValidationError,
  ConflictError,
  BadRequestError
};

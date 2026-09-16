// The backend's own error taxonomy, returned to clients as { error: <code> }. Never leak a
// raw Betway errorCode/errorMessage through this shape (docs/betway-api.md §10).
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export class InvalidCodeError extends ApiError {
  constructor() {
    super(404, "invalid_code");
  }
}

export class ConflictingSelectionsError extends ApiError {
  constructor() {
    super(400, "conflicting_selections");
  }
}

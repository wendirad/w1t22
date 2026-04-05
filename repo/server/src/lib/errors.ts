export class AppError extends Error {
  public readonly code: number;
  public readonly msg: string;

  constructor(code: number, msg: string) {
    super(msg);
    this.code = code;
    this.msg = msg;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(msg: string = 'Bad request') {
    super(400, msg);
  }
}

export class UnauthorizedError extends AppError {
  constructor(msg: string = 'Unauthorized') {
    super(401, msg);
  }
}

export class ForbiddenError extends AppError {
  constructor(msg: string = 'Forbidden') {
    super(403, msg);
  }
}

export class NotFoundError extends AppError {
  constructor(msg: string = 'Resource not found') {
    super(404, msg);
  }
}

export class ConflictError extends AppError {
  constructor(msg: string = 'Conflict') {
    super(409, msg);
  }
}

export class ValidationError extends AppError {
  constructor(msg: string = 'Validation failed') {
    super(422, msg);
  }
}

export class TooLargeError extends AppError {
  constructor(msg: string = 'Payload too large') {
    super(413, msg);
  }
}

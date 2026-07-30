export class BusinessRuleError extends Error {
  readonly statusCode = 409;

  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}

export class ResourceNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ResourceNotFoundError';
  }
}

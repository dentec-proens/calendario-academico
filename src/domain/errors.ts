/**
 * A rule violation the user can correct. Its message is shown unchanged by every adapter;
 * `status` follows HTTP: 400 for invalid input, 404 for a missing record, 409 when the data
 * changed meanwhile.
 */
export class DomainError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(message: string, status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

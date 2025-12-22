/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

export class OAGIError extends Error {}

export class APIError extends OAGIError {
  constructor(
    public response: Response,
    message?: string,
  ) {
    super(message ?? response.statusText);
  }

  toString() {
    return `API Error [${this.response.status}]: ${this.message}`;
  }
}
export class AuthenticationError extends APIError {}
export class RateLimitError extends APIError {}
export class ValidationError extends APIError {}
export class NotFoundError extends APIError {}
export class ServerError extends APIError {}

export class ConfigurationError extends OAGIError {}

export class NetworkError extends OAGIError {
  constructor(
    message: string,
    public originalError: Error,
  ) {
    super(message);
  }
}
export class RequestTimeoutError extends NetworkError {}

export class RequestError extends OAGIError {
  constructor(public response: Response) {
    super(`${response.status} ${response.statusText}`);
  }
}

export class ValueError extends OAGIError {}

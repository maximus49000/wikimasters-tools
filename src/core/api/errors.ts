export class ApiHttpError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(status: number, endpoint: string) {
    super(`HTTP ${status} pour ${endpoint}`);
    this.name = 'ApiHttpError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

export class ApiFormatError extends Error {
  readonly endpoint: string;
  readonly detail: string;

  constructor(endpoint: string, detail: string) {
    super(`Format inattendu pour ${endpoint} : ${detail}`);
    this.name = 'ApiFormatError';
    this.endpoint = endpoint;
    this.detail = detail;
  }
}

export class NotAuthenticatedError extends Error {
  readonly endpoint: string;
  readonly status: number;

  constructor(endpoint: string, status: number) {
    super(`Non connecté (HTTP ${status} pour ${endpoint})`);
    this.name = 'NotAuthenticatedError';
    this.endpoint = endpoint;
    this.status = status;
  }
}

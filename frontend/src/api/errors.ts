/** Error dari API dalam bentuk RFC 7807 ProblemDetails; `code` berisi ID business rule (mis. BR-04). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const businessError = (code: string, message: string) => new ApiError(422, message, code);
export const forbidden = (message = 'Anda tidak memiliki akses ke data ini.') => new ApiError(403, message, 'FORBIDDEN');
export const notFound = (message: string) => new ApiError(404, message, 'NOT_FOUND');
export const badRequest = (message: string) => new ApiError(400, message, 'VALIDATION');

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Terjadi kesalahan. Coba lagi.';

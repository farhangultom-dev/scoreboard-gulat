import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      status: 'error',
      error: 'Validation Error',
      message: 'Payload request tidak valid. Periksa kembali format data.',
      issues: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      error: err.message,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  ) {
    res.status(409).json({
      status: 'error',
      error: 'Conflict (Duplicate Entry)',
      message:
        'Terjadi duplikasi data unik di database MySQL (misalnya nomor undian bola yang sama dalam satu divisi).',
    });
    return;
  }

  console.error('❌ [Unhandled API Error]:', err);
  res.status(500).json({
    status: 'error',
    error: 'Internal Server Error',
    message: err instanceof Error ? err.message : 'Terjadi kesalahan internal pada server lokal.',
  });
}

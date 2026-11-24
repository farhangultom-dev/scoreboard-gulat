"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.asyncHandler = asyncHandler;
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
class AppError extends Error {
    statusCode;
    details;
    constructor(statusCode, message, details) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.AppError = AppError;
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
function errorHandler(err, _req, res, _next) {
    if (err instanceof zod_1.ZodError) {
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
    if (typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        err.code === 'P2002') {
        res.status(409).json({
            status: 'error',
            error: 'Conflict (Duplicate Entry)',
            message: 'Terjadi duplikasi data unik di database MySQL (misalnya nomor undian bola yang sama dalam satu divisi).',
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

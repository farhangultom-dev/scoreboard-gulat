import { RequestHandler } from 'express';
import { ZodTypeAny } from 'zod';

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateParams(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      next(err);
    }
  };
}

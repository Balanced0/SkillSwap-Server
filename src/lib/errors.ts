import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>) {
  return (request: Request, response: Response, next: NextFunction) => { void handler(request, response, next).catch(next); };
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof HttpError ? error.message : "Something went wrong on the server.";
  if (statusCode >= 500) console.error(error);
  response.status(statusCode).json({ message });
}

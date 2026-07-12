import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../lib/errors.js";

export type AuthenticatedRequest = Request & { userId: string };

export function issueToken(userId: string) {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: "7d" });
}

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const token = request.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return next(new HttpError(401, "Sign in to continue."));
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (typeof payload === "string" || !payload.sub) throw new Error("Missing subject");
    (request as AuthenticatedRequest).userId = payload.sub;
    return next();
  } catch {
    return next(new HttpError(401, "Your session has expired. Please sign in again."));
  }
}

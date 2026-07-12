import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";
import { HttpError } from "../lib/errors.js";
import { User } from "../models/index.js";

export type AuthenticatedRequest = Request & { userId: string };

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session?.user) throw new HttpError(401, "Sign in with Google to continue.");
    const member = await User.findOneAndUpdate(
      { authUserId: session.user.id },
      { $setOnInsert: { authUserId: session.user.id, name: session.user.name || "SkillSwap member", email: session.user.email, avatarUrl: session.user.image || undefined } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    (request as AuthenticatedRequest).userId = member._id.toString();
    return next();
  } catch (error) {
    return next(error instanceof HttpError ? error : new HttpError(401, "Your Google session has expired. Please sign in again."));
  }
}

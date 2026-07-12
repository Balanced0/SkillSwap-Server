import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { HttpError, asyncRoute } from "../lib/errors.js";
import { serializeReview } from "../lib/serializers.js";
import { Review, Session, User } from "../models/index.js";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.js";

const reviewSchema = z.object({ sessionId: z.string().trim(), rating: z.number().int().min(1).max(5), comment: z.string().trim().min(3).max(600) });

export const reviewsRouter = Router();

reviewsRouter.post("/", requireAuth, asyncRoute(async (request, response) => {
  const parsed = reviewSchema.safeParse(request.body);
  if (!parsed.success || !mongoose.isValidObjectId(parsed.data?.sessionId)) throw new HttpError(400, "Add a rating and a short, useful review.");
  const reviewerId = (request as AuthenticatedRequest).userId;
  const session = await Session.findById(parsed.data.sessionId);
  if (!session || session.status !== "Completed") throw new HttpError(400, "Reviews are available after a completed session.");
  let revieweeId: string;
  if (String(session.teacherId) === reviewerId) revieweeId = String(session.learnerId);
  else if (String(session.learnerId) === reviewerId) revieweeId = String(session.teacherId);
  else throw new HttpError(403, "Only session participants can write a review.");
  if (await Review.exists({ sessionId: session._id, reviewerId })) throw new HttpError(409, "You have already reviewed this session.");
  const review = await Review.create({ ...parsed.data, reviewerId, revieweeId });
  const ratings = await Review.aggregate<{ average: number }>([{ $match: { revieweeId: new mongoose.Types.ObjectId(revieweeId) } }, { $group: { _id: null, average: { $avg: "$rating" } } }]);
  await User.findByIdAndUpdate(revieweeId, { averageRating: Number((ratings[0]?.average ?? 0).toFixed(2)) });
  await review.populate("reviewerId", "name avatarUrl");
  response.status(201).json({ review: serializeReview(review) });
}));

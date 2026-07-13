import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { SKILL_CATEGORIES, SKILL_LEVELS } from "../constants.js";
import { HttpError, asyncRoute } from "../lib/errors.js";
import { serializeUser, serializePublicMember, serializeListing, serializeReview } from "../lib/serializers.js";
import { User, Listing, Review, type UserDocument, type ListingDocument } from "../models/index.js";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.js";

const offeredSkillSchema = z.object({ skillName: z.string().trim().min(1).max(80), category: z.enum(SKILL_CATEGORIES), level: z.enum(SKILL_LEVELS) });
const wantedSkillSchema = z.object({ skillName: z.string().trim().min(1).max(80), category: z.enum(SKILL_CATEGORIES) });
const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  avatarUrl: z.string().trim().url().max(2048).or(z.literal("")).optional(),
  bio: z.string().trim().max(600).optional(),
  location: z.string().trim().max(120).optional(),
  skillsOffered: z.array(offeredSkillSchema).max(30).optional(),
  skillsWanted: z.array(wantedSkillSchema).max(30).optional(),
}).strict();

export const membersRouter = Router();

membersRouter.get("/me", requireAuth, asyncRoute(async (request, response) => {
  const user = await User.findById((request as AuthenticatedRequest).userId);
  if (!user) throw new HttpError(401, "Your SkillSwap profile is unavailable.");
  response.json({ user: serializeUser(user) });
}));

membersRouter.patch("/me", requireAuth, asyncRoute(async (request, response) => {
  const parsed = updateProfileSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check your profile details and try again.");
  const update = { ...parsed.data };
  if (update.avatarUrl === "") update.avatarUrl = undefined;
  const user = await User.findByIdAndUpdate((request as AuthenticatedRequest).userId, update, { new: true, runValidators: true }) as UserDocument | null;
  if (!user) throw new HttpError(404, "Member not found.");
  response.json({ user: serializeUser(user) });
}));

membersRouter.get("/:id", asyncRoute(async (request, response) => {
  const memberId = request.params.id;
  if (!mongoose.isValidObjectId(memberId)) throw new HttpError(404, "Member not found.");
  const user = await User.findById(memberId);
  if (!user) throw new HttpError(404, "Member not found.");
  response.json({ user: serializePublicMember(user) });
}));

membersRouter.get("/:id/listings", asyncRoute(async (request, response) => {
  const memberId = request.params.id;
  if (!mongoose.isValidObjectId(memberId)) throw new HttpError(404, "Member not found.");
  const listings = await Listing.find({ userId: memberId, status: "Active" }).sort({ createdAt: -1 }).populate("userId", "name avatarUrl location averageRating sessionsCompleted");
  response.json({ listings: listings.map((listing) => serializeListing(listing as ListingDocument)) });
}));

membersRouter.get("/:id/reviews", asyncRoute(async (request, response) => {
  const memberId = request.params.id;
  if (!mongoose.isValidObjectId(memberId)) throw new HttpError(404, "Member not found.");
  const reviews = await Review.find({ revieweeId: memberId }).sort({ createdAt: -1 }).populate("reviewerId", "name avatarUrl");
  response.json({ reviews: reviews.map((review) => serializeReview(review)) });
}));


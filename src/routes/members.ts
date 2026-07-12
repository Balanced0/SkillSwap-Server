import { Router } from "express";
import { z } from "zod";
import { SKILL_CATEGORIES, SKILL_LEVELS } from "../constants.js";
import { HttpError, asyncRoute } from "../lib/errors.js";
import { serializeUser } from "../lib/serializers.js";
import { User, type UserDocument } from "../models/index.js";
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

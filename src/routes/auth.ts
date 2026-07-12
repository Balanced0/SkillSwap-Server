import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { SKILL_CATEGORIES, SKILL_LEVELS } from "../constants.js";
import { HttpError, asyncRoute } from "../lib/errors.js";
import { serializeUser } from "../lib/serializers.js";
import { User, type UserDocument } from "../models/index.js";
import { type AuthenticatedRequest, issueToken, requireAuth } from "../middleware/auth.js";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().email("Enter a valid email address.").max(320),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(128),
  location: z.string().trim().max(120).optional(),
});

const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });
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

export const authRouter = Router();

authRouter.post("/register", asyncRoute(async (request, response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check your details and try again.");
  const email = parsed.data.email.toLowerCase();
  if (await User.exists({ email })) throw new HttpError(409, "An account with that email already exists.");
  const user = await User.create({ ...parsed.data, email, passwordHash: await bcrypt.hash(parsed.data.password, 12) });
  response.status(201).json({ token: issueToken(user._id.toString()), user: serializeUser(user) });
}));

authRouter.post("/login", asyncRoute(async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, "Enter your email and password.");
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) throw new HttpError(401, "That email or password is not correct.");
  response.json({ token: issueToken(user._id.toString()), user: serializeUser(user) });
}));

authRouter.post("/demo", asyncRoute(async (_request, response) => {
  const email = "demo@skillswap.local";
  let user = await User.findOne({ email });
  if (!user) user = await User.create({ name: "Demo Member", email, passwordHash: await bcrypt.hash("not-used-for-demo", 12), bio: "A temporary account for exploring SkillSwap's live flows.", location: "Community demo" });
  response.json({ token: issueToken(user._id.toString()), user: serializeUser(user) });
}));

authRouter.get("/me", requireAuth, asyncRoute(async (request, response) => {
  const user = await User.findById((request as AuthenticatedRequest).userId);
  if (!user) throw new HttpError(401, "Your account no longer exists.");
  response.json({ user: serializeUser(user) });
}));

authRouter.patch("/me", requireAuth, asyncRoute(async (request, response) => {
  const parsed = updateProfileSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check your profile details and try again.");
  const update = { ...parsed.data };
  if (update.avatarUrl === "") update.avatarUrl = undefined;
  const user = await User.findByIdAndUpdate((request as AuthenticatedRequest).userId, update, { new: true, runValidators: true }) as UserDocument | null;
  if (!user) throw new HttpError(404, "Member not found.");
  response.json({ user: serializeUser(user) });
}));

import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { SKILL_CATEGORIES } from "../constants.js";
import { HttpError, asyncRoute } from "../lib/errors.js";
import { serializeWant } from "../lib/serializers.js";
import { Want, type WantDocument } from "../models/index.js";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.js";

const wantCreateSchema = z.object({
  skillName: z.string().trim().min(3, "Skill title must be at least 3 characters.").max(90),
  category: z.enum(SKILL_CATEGORIES),
  description: z.string().trim().min(20, "Give prospective teachers more detail (at least 20 characters).").max(3000),
});

const userSelect = "name avatarUrl location";

function idParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

export const wantsRouter = Router();

wantsRouter.get("/", asyncRoute(async (request, response) => {
  const page = Math.max(1, Number.parseInt(String(request.query.page ?? "1"), 10) || 1);
  const limit = Math.min(24, Math.max(1, Number.parseInt(String(request.query.limit ?? "12"), 10) || 12));
  
  const filter: { $text?: { $search: string }; category?: string } = {};
  const search = String(request.query.search ?? "").trim();
  const category = String(request.query.category ?? "");
  
  if (search) filter.$text = { $search: search };
  if (SKILL_CATEGORIES.includes(category as (typeof SKILL_CATEGORIES)[number])) filter.category = category;
  
  const [wants, total] = await Promise.all([
    Want.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", userSelect),
    Want.countDocuments(filter)
  ]);
  
  response.json({
    wants: wants.map((want) => serializeWant(want as WantDocument)),
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    total
  });
}));

wantsRouter.post("/", requireAuth, asyncRoute(async (request, response) => {
  const parsed = wantCreateSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the request details and try again.");
  }
  
  const want = await Want.create({
    ...parsed.data,
    userId: (request as AuthenticatedRequest).userId,
  });
  
  await want.populate("userId", userSelect);
  response.status(201).json({ want: serializeWant(want as WantDocument) });
}));

wantsRouter.delete("/:id", requireAuth, asyncRoute(async (request, response) => {
  const wantId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(wantId)) {
    throw new HttpError(404, "Request not found.");
  }
  
  const deleted = await Want.findOneAndDelete({
    _id: wantId,
    userId: (request as AuthenticatedRequest).userId
  });
  
  if (!deleted) {
    throw new HttpError(404, "Request not found.");
  }
  
  response.json({ message: "Learning request deleted." });
}));

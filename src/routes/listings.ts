import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { SKILL_CATEGORIES, SKILL_LEVELS } from "../constants.js";
import { HttpError, asyncRoute } from "../lib/errors.js";
import { serializeListing, serializeReview } from "../lib/serializers.js";
import { Listing, Review, type IListing, type ListingDocument } from "../models/index.js";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.js";

const availabilitySchema = z.object({ day: z.string().trim().min(1).max(80), timeSlots: z.array(z.string().trim().min(1).max(80)).max(20) });
const listingSchema = z.object({
  title: z.string().trim().min(3).max(90),
  category: z.enum(SKILL_CATEGORIES),
  tags: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  description: z.string().trim().min(20, "Give learners a little more detail (at least 20 characters).").max(3000),
  level: z.enum(SKILL_LEVELS),
  availability: z.array(availabilitySchema).max(7).default([]),
  imageUrl: z.string().trim().url().max(2048).optional(),
});
const updateListingSchema = listingSchema.partial().extend({ status: z.enum(["Active", "Paused"]).optional() }).strict();
const teacherSelect = "name avatarUrl location averageRating sessionsCompleted";

async function findListingForDisplay(id: string, status?: "Active" | "Paused") {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "Listing not found.");
  const query: { _id: string; status?: "Active" | "Paused" } = { _id: id };
  if (status) query.status = status;
  return Listing.findOne(query).populate("userId", teacherSelect);
}

function idParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

export const listingsRouter = Router();

listingsRouter.get("/mine", requireAuth, asyncRoute(async (request, response) => {
  const listings = await Listing.find({ userId: (request as AuthenticatedRequest).userId }).sort({ createdAt: -1 }).populate("userId", teacherSelect);
  response.json({ listings: listings.map((listing) => serializeListing(listing as ListingDocument)) });
}));

listingsRouter.get("/", asyncRoute(async (request, response) => {
  const page = Math.max(1, Number.parseInt(String(request.query.page ?? "1"), 10) || 1);
  const limit = Math.min(24, Math.max(1, Number.parseInt(String(request.query.limit ?? "12"), 10) || 12));
  const filter: { status: "Active"; $text?: { $search: string }; category?: string; level?: string } = { status: "Active" };
  const search = String(request.query.search ?? "").trim();
  const category = String(request.query.category ?? "");
  const level = String(request.query.level ?? "");
  if (search) filter.$text = { $search: search };
  if (SKILL_CATEGORIES.includes(category as (typeof SKILL_CATEGORIES)[number])) filter.category = category;
  if (SKILL_LEVELS.includes(level as (typeof SKILL_LEVELS)[number])) filter.level = level;
  const sort: Record<string, 1 | -1> = request.query.sort === "rating" ? { createdAt: -1 } : request.query.sort === "alphabetical" ? { title: 1 } : { createdAt: -1 };
  const [listings, total] = await Promise.all([Listing.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).populate("userId", teacherSelect), Listing.countDocuments(filter)]);
  const ordered = request.query.sort === "rating" ? listings.sort((first, second) => {
    const firstTeacher = first.userId as unknown as { averageRating?: number };
    const secondTeacher = second.userId as unknown as { averageRating?: number };
    return (secondTeacher.averageRating ?? 0) - (firstTeacher.averageRating ?? 0);
  }) : listings;
  response.json({ listings: ordered.map((listing) => serializeListing(listing as ListingDocument)), page, pages: Math.max(1, Math.ceil(total / limit)), total });
}));

listingsRouter.get("/:id", asyncRoute(async (request, response) => {
  const listing = await findListingForDisplay(idParam(request.params.id), "Active");
  if (!listing) throw new HttpError(404, "This listing is not available.");
  const teacherId = listing.userId._id;
  const [reviews, related] = await Promise.all([
    Review.find({ revieweeId: teacherId }).sort({ createdAt: -1 }).limit(6).populate("reviewerId", "name avatarUrl"),
    Listing.find({ category: listing.category, userId: { $ne: teacherId }, status: "Active" }).sort({ createdAt: -1 }).limit(4).populate("userId", teacherSelect),
  ]);
  response.json({ listing: serializeListing(listing as ListingDocument), reviews: reviews.map((review) => serializeReview(review)), relatedListings: related.map((item) => serializeListing(item as ListingDocument)) });
}));

listingsRouter.post("/", requireAuth, asyncRoute(async (request, response) => {
  const parsed = listingSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the listing details and try again.");
  const listing = await Listing.create({ ...parsed.data, userId: (request as AuthenticatedRequest).userId });
  await listing.populate("userId", teacherSelect);
  response.status(201).json({ listing: serializeListing(listing as ListingDocument) });
}));

listingsRouter.patch("/:id", requireAuth, asyncRoute(async (request, response) => {
  const listingId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(listingId)) throw new HttpError(404, "Listing not found.");
  const parsed = updateListingSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the listing details and try again.");
  const update = { ...parsed.data };
  if (update.imageUrl === "") update.imageUrl = undefined;
  const listing = await Listing.findOneAndUpdate({ _id: listingId, userId: (request as AuthenticatedRequest).userId }, update, { new: true, runValidators: true }).populate("userId", teacherSelect);
  if (!listing) throw new HttpError(404, "Listing not found.");
  response.json({ listing: serializeListing(listing as ListingDocument) });
}));

listingsRouter.delete("/:id", requireAuth, asyncRoute(async (request, response) => {
  const listingId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(listingId)) throw new HttpError(404, "Listing not found.");
  const deleted = await Listing.findOneAndDelete({ _id: listingId, userId: (request as AuthenticatedRequest).userId });
  if (!deleted) throw new HttpError(404, "Listing not found.");
  response.json({ message: "Listing deleted." });
}));

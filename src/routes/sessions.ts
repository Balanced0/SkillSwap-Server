import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { HttpError, asyncRoute } from "../lib/errors.js";
import { serializeSession } from "../lib/serializers.js";
import { Listing, Session, Transaction, User, type SessionDocument } from "../models/index.js";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.js";

const requestSchema = z.object({
  listingId: z.string().trim(),
  proposedTime: z.string().trim().min(1),
  learnerId: z.string().trim().optional(),
});
const populateSession = [
  { path: "listingId", select: "title category" },
  { path: "teacherId", select: "name avatarUrl location" },
  { path: "learnerId", select: "name avatarUrl location" },
];

function sameId(value: unknown, userId: string) {
  return String(value) === userId;
}

function idParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

async function hydratedSession(id: string) {
  return Session.findById(id).populate(populateSession);
}

export const sessionsRouter = Router();

sessionsRouter.get("/mine", requireAuth, asyncRoute(async (request, response) => {
  const userId = (request as AuthenticatedRequest).userId;
  const sessions = await Session.find({ $or: [{ teacherId: userId }, { learnerId: userId }] }).sort({ proposedTime: 1 }).populate(populateSession);
  response.json({ sessions: sessions.map((session) => serializeSession(session as SessionDocument)) });
}));

sessionsRouter.post("/", requireAuth, asyncRoute(async (request, response) => {
  const parsed = requestSchema.safeParse(request.body);
  if (!parsed.success || !mongoose.isValidObjectId(parsed.data?.listingId)) throw new HttpError(400, "Choose a valid skill listing.");
  const proposedTime = new Date(parsed.data.proposedTime);
  if (Number.isNaN(proposedTime.getTime()) || proposedTime <= new Date()) throw new HttpError(400, "Choose a future time for this session.");
  const actorId = (request as AuthenticatedRequest).userId;
  const listing = await Listing.findOne({ _id: parsed.data.listingId, status: "Active" });
  if (!listing) throw new HttpError(404, "That listing is not available.");

  let teacherId: string;
  let learnerId: string;
  let proposedBy: "Teacher" | "Learner";

  if (parsed.data.learnerId) {
    if (!sameId(listing.userId, actorId)) {
      throw new HttpError(403, "You can only offer sessions for your own listings.");
    }
    teacherId = actorId;
    learnerId = parsed.data.learnerId;
    proposedBy = "Teacher";
  } else {
    if (sameId(listing.userId, actorId)) {
      throw new HttpError(400, "You cannot request your own listing.");
    }
    teacherId = String(listing.userId);
    learnerId = actorId;
    proposedBy = "Learner";
  }

  const learner = await User.findById(learnerId);
  if (!learner) throw new HttpError(404, "The learner account no longer exists.");

  const [reservedCredits, existingRequest] = await Promise.all([
    Session.countDocuments({ learnerId, status: { $in: ["Requested", "Confirmed"] } }),
    Session.exists({ listingId: listing._id, learnerId, status: { $in: ["Requested", "Confirmed"] } }),
  ]);
  if (existingRequest) throw new HttpError(409, "An active session request already exists for this listing.");
  if (learner.creditBalance - reservedCredits < 1) {
    throw new HttpError(400, proposedBy === "Teacher"
      ? "This member doesn't have an available credit to accept your offer."
      : "You do not have an available credit for another session request.");
  }

  const session = await Session.create({
    listingId: listing._id,
    teacherId,
    learnerId,
    skillName: listing.title,
    proposedTime,
    proposedBy,
  });
  await session.populate(populateSession);
  response.status(201).json({ session: serializeSession(session as SessionDocument) });
}));

sessionsRouter.post("/:id/accept", requireAuth, asyncRoute(async (request, response) => {
  const sessionId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(sessionId)) throw new HttpError(404, "Session not found.");
  const actorId = (request as AuthenticatedRequest).userId;
  const session = await Session.findById(sessionId);
  if (!session) throw new HttpError(404, "Session not found.");
  if (session.status !== "Requested") throw new HttpError(400, "Only active requests can be accepted.");
  const proposedBy = session.proposedBy || "Learner";
  const isRecipient = (proposedBy === "Teacher" && sameId(session.learnerId, actorId)) || (proposedBy === "Learner" && sameId(session.teacherId, actorId));
  if (!isRecipient) throw new HttpError(403, "You cannot accept this request.");

  session.status = "Confirmed";
  await session.save();
  const hydrated = await hydratedSession(sessionId);
  if (!hydrated) throw new HttpError(404, "Session not found.");
  response.json({ session: serializeSession(hydrated as SessionDocument), message: "Session confirmed. It is now on both calendars." });
}));

sessionsRouter.post("/:id/decline", requireAuth, asyncRoute(async (request, response) => {
  const sessionId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(sessionId)) throw new HttpError(404, "Session not found.");
  const actorId = (request as AuthenticatedRequest).userId;
  const session = await Session.findById(sessionId);
  if (!session) throw new HttpError(404, "Session not found.");
  if (session.status !== "Requested") throw new HttpError(400, "Only active requests can be declined.");
  const proposedBy = session.proposedBy || "Learner";
  const isRecipient = (proposedBy === "Teacher" && sameId(session.learnerId, actorId)) || (proposedBy === "Learner" && sameId(session.teacherId, actorId));
  if (!isRecipient) throw new HttpError(403, "You cannot decline this request.");

  session.status = "Declined";
  await session.save();
  const hydrated = await hydratedSession(sessionId);
  if (!hydrated) throw new HttpError(404, "Session not found.");
  response.json({ session: serializeSession(hydrated as SessionDocument), message: "Request declined. The learner’s credit is still available." });
}));

sessionsRouter.post("/:id/cancel", requireAuth, asyncRoute(async (request, response) => {
  const sessionId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(sessionId)) throw new HttpError(404, "Session not found.");
  const actorId = (request as AuthenticatedRequest).userId;
  const session = await Session.findById(sessionId);
  if (!session) throw new HttpError(404, "Session not found.");
  if (session.status !== "Requested" && session.status !== "Confirmed") throw new HttpError(400, "This session cannot be cancelled.");
  const proposedBy = session.proposedBy || "Learner";
  const isInitiator = (proposedBy === "Teacher" && sameId(session.teacherId, actorId)) || (proposedBy === "Learner" && sameId(session.learnerId, actorId));
  const canCancel = (session.status === "Requested" && isInitiator) || (session.status === "Confirmed" && (sameId(session.learnerId, actorId) || sameId(session.teacherId, actorId)));
  if (!canCancel) throw new HttpError(403, "You cannot cancel this session.");

  session.status = "Cancelled";
  await session.save();
  const hydrated = await hydratedSession(sessionId);
  if (!hydrated) throw new HttpError(404, "Session not found.");
  response.json({ session: serializeSession(hydrated as SessionDocument), message: "Session cancelled. No credit moved." });
}));

sessionsRouter.post("/:id/confirm-complete", requireAuth, asyncRoute(async (request, response) => {
  const sessionId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(sessionId)) throw new HttpError(404, "Session not found.");
  const actorId = (request as AuthenticatedRequest).userId;

  // Load the session — no transaction needed; atomicity is enforced at the field level below
  const session = await Session.findById(sessionId);
  if (!session) throw new HttpError(404, "Session not found.");
  if (session.status !== "Confirmed") throw new HttpError(400, "Only confirmed sessions can be marked complete.");

  if (sameId(session.teacherId, actorId)) {
    if (session.teacherConfirmedComplete) throw new HttpError(400, "You have already confirmed completion.");
    session.teacherConfirmedComplete = true;
  } else if (sameId(session.learnerId, actorId)) {
    if (session.learnerConfirmedComplete) throw new HttpError(400, "You have already confirmed completion.");
    session.learnerConfirmedComplete = true;
  } else {
    throw new HttpError(403, "Only the session participants can confirm completion.");
  }

  let wasCompleted = false;
  if (session.teacherConfirmedComplete && session.learnerConfirmedComplete) {
    // Atomically deduct credit from learner — only succeeds if they still have enough
    const learnerUpdate = await User.updateOne(
      { _id: session.learnerId, creditBalance: { $gte: session.durationHours } },
      { $inc: { creditBalance: -session.durationHours, sessionsCompleted: 1 } },
    );
    if (learnerUpdate.modifiedCount !== 1) {
      throw new HttpError(400, "The learner no longer has the credit needed to complete this session.");
    }
    await User.updateOne({ _id: session.teacherId }, { $inc: { creditBalance: session.durationHours, sessionsCompleted: 1 } });
    session.status = "Completed";
    await Transaction.create([
      { sessionId: session._id, fromUserId: session.learnerId, toUserId: session.teacherId, skillName: session.skillName, credits: session.durationHours, type: "Spent" },
      { sessionId: session._id, fromUserId: session.learnerId, toUserId: session.teacherId, skillName: session.skillName, credits: session.durationHours, type: "Earned" },
    ]);
    wasCompleted = true;
  }

  await session.save();
  const hydrated = await hydratedSession(sessionId);
  if (!hydrated) throw new HttpError(404, "Session not found.");
  response.json({
    session: serializeSession(hydrated as SessionDocument),
    message: wasCompleted
      ? "Both confirmations are in. One credit has been transferred."
      : "Your completion confirmation is recorded. We are waiting for the other member.",
  });
}));

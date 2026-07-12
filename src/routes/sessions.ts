import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { HttpError, asyncRoute } from "../lib/errors.js";
import { serializeSession } from "../lib/serializers.js";
import { Listing, Session, Transaction, User, type SessionDocument } from "../models/index.js";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.js";

const requestSchema = z.object({ listingId: z.string().trim(), proposedTime: z.string().trim().min(1) });
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
  const learnerId = (request as AuthenticatedRequest).userId;
  const [listing, learner] = await Promise.all([Listing.findOne({ _id: parsed.data.listingId, status: "Active" }), User.findById(learnerId)]);
  if (!listing) throw new HttpError(404, "That listing is not available.");
  if (!learner) throw new HttpError(401, "Your account no longer exists.");
  if (sameId(listing.userId, learnerId)) throw new HttpError(400, "You cannot request your own listing.");
  const [reservedCredits, existingRequest] = await Promise.all([
    Session.countDocuments({ learnerId, status: { $in: ["Requested", "Confirmed"] } }),
    Session.exists({ listingId: listing._id, learnerId, status: { $in: ["Requested", "Confirmed"] } }),
  ]);
  if (existingRequest) throw new HttpError(409, "You already have an active request for this listing.");
  if (learner.creditBalance - reservedCredits < 1) throw new HttpError(400, "You do not have an available credit for another session request.");
  const session = await Session.create({ listingId: listing._id, teacherId: listing.userId, learnerId, skillName: listing.title, proposedTime });
  await session.populate(populateSession);
  response.status(201).json({ session: serializeSession(session as SessionDocument) });
}));

sessionsRouter.post("/:id/accept", requireAuth, asyncRoute(async (request, response) => {
  const sessionId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(sessionId)) throw new HttpError(404, "Session not found.");
  const session = await Session.findOneAndUpdate({ _id: sessionId, teacherId: (request as AuthenticatedRequest).userId, status: "Requested" }, { status: "Confirmed" }, { new: true }).populate(populateSession);
  if (!session) throw new HttpError(400, "Only the teacher can accept an active request.");
  response.json({ session: serializeSession(session as SessionDocument), message: "Session confirmed. It is now on both calendars." });
}));

sessionsRouter.post("/:id/decline", requireAuth, asyncRoute(async (request, response) => {
  const sessionId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(sessionId)) throw new HttpError(404, "Session not found.");
  const session = await Session.findOneAndUpdate({ _id: sessionId, teacherId: (request as AuthenticatedRequest).userId, status: "Requested" }, { status: "Declined" }, { new: true }).populate(populateSession);
  if (!session) throw new HttpError(400, "Only the teacher can decline an active request.");
  response.json({ session: serializeSession(session as SessionDocument), message: "Request declined. The learner’s credit is still available." });
}));

sessionsRouter.post("/:id/cancel", requireAuth, asyncRoute(async (request, response) => {
  const sessionId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(sessionId)) throw new HttpError(404, "Session not found.");
  const session = await Session.findOneAndUpdate({ _id: sessionId, learnerId: (request as AuthenticatedRequest).userId, status: { $in: ["Requested", "Confirmed"] } }, { status: "Cancelled" }, { new: true }).populate(populateSession);
  if (!session) throw new HttpError(400, "This session cannot be cancelled by the learner.");
  response.json({ session: serializeSession(session as SessionDocument), message: "Session cancelled. No credit moved." });
}));

sessionsRouter.post("/:id/confirm-complete", requireAuth, asyncRoute(async (request, response) => {
  const sessionId = idParam(request.params.id);
  if (!mongoose.isValidObjectId(sessionId)) throw new HttpError(404, "Session not found.");
  const actorId = (request as AuthenticatedRequest).userId;
  const transaction = await mongoose.startSession();
  let wasCompleted = false;
  try {
    await transaction.withTransaction(async () => {
      const session = await Session.findById(sessionId).session(transaction);
      if (!session) throw new HttpError(404, "Session not found.");
      if (session.status !== "Confirmed") throw new HttpError(400, "Only confirmed sessions can be marked complete.");
      if (sameId(session.teacherId, actorId)) session.teacherConfirmedComplete = true;
      else if (sameId(session.learnerId, actorId)) session.learnerConfirmedComplete = true;
      else throw new HttpError(403, "Only the session participants can confirm completion.");
      if (session.teacherConfirmedComplete && session.learnerConfirmedComplete) {
        const learnerUpdate = await User.updateOne({ _id: session.learnerId, creditBalance: { $gte: session.durationHours } }, { $inc: { creditBalance: -session.durationHours, sessionsCompleted: 1 } }, { session: transaction });
        if (learnerUpdate.modifiedCount !== 1) throw new HttpError(400, "The learner no longer has the credit needed to complete this session.");
        await User.updateOne({ _id: session.teacherId }, { $inc: { creditBalance: session.durationHours, sessionsCompleted: 1 } }, { session: transaction });
        session.status = "Completed";
        await Transaction.create([
          { sessionId: session._id, fromUserId: session.learnerId, toUserId: session.teacherId, skillName: session.skillName, credits: session.durationHours, type: "Spent" },
          { sessionId: session._id, fromUserId: session.learnerId, toUserId: session.teacherId, skillName: session.skillName, credits: session.durationHours, type: "Earned" },
        ], { session: transaction });
        wasCompleted = true;
      }
      await session.save({ session: transaction });
    });
  } finally {
    await transaction.endSession();
  }
  const session = await hydratedSession(sessionId);
  if (!session) throw new HttpError(404, "Session not found.");
  response.json({ session: serializeSession(session as SessionDocument), message: wasCompleted ? "Both confirmations are in. One credit has been transferred." : "Your completion confirmation is recorded. We are waiting for the other member." });
}));

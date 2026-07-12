import { Router } from "express";
import { asyncRoute, HttpError } from "../lib/errors.js";
import { serializeSession, serializeUser } from "../lib/serializers.js";
import { Listing, Session, Transaction, User, type SessionDocument } from "../models/index.js";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.js";
import { getLedger } from "../services/ledger.js";

const sessionPopulate = [
  { path: "listingId", select: "title category" },
  { path: "teacherId", select: "name avatarUrl location" },
  { path: "learnerId", select: "name avatarUrl location" },
];

export const platformRouter = Router();

platformRouter.get("/stats", asyncRoute(async (_request, response) => {
  const [hours, sessionsCompleted, skillsListed, members] = await Promise.all([
    Transaction.aggregate<{ credits: number }>([{ $match: { type: "Earned" } }, { $group: { _id: null, credits: { $sum: "$credits" } } }]),
    Session.countDocuments({ status: "Completed" }),
    Listing.countDocuments({ status: "Active" }),
    User.countDocuments(),
  ]);
  response.json({ hoursSwapped: hours[0]?.credits ?? 0, sessionsCompleted, skillsListed, members });
}));

platformRouter.get("/ledger", requireAuth, asyncRoute(async (request, response) => {
  const userId = (request as AuthenticatedRequest).userId;
  response.json(await getLedger(userId));
}));

platformRouter.get("/dashboard", requireAuth, asyncRoute(async (request, response) => {
  const userId = (request as AuthenticatedRequest).userId;
  const [member, ledger, upcomingSessions, taughtSessions] = await Promise.all([
    User.findById(userId),
    getLedger(userId),
    Session.find({ $or: [{ teacherId: userId }, { learnerId: userId }], status: "Confirmed", proposedTime: { $gte: new Date() } }).sort({ proposedTime: 1 }).limit(5).populate(sessionPopulate),
    Session.find({ teacherId: userId, status: "Completed" }).populate("listingId", "category"),
  ]);
  if (!member) throw new HttpError(401, "Your account no longer exists.");
  const creditHistoryMap = new Map<string, { date: string; earned: number; spent: number }>();
  for (const transaction of [...ledger.transactions].reverse()) {
    const date = new Date(transaction.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const entry = creditHistoryMap.get(date) ?? { date, earned: 0, spent: 0 };
    if (transaction.type === "Earned") entry.earned += transaction.credits;
    else entry.spent += transaction.credits;
    creditHistoryMap.set(date, entry);
  }
  const categories = new Map<string, number>();
  for (const session of taughtSessions) {
    const listing = session.listingId as unknown as { category?: string };
    if (listing.category) categories.set(listing.category, (categories.get(listing.category) ?? 0) + session.durationHours);
  }
  response.json({
    member: serializeUser(member),
    transactions: ledger.transactions,
    upcomingSessions: upcomingSessions.map((session) => serializeSession(session as SessionDocument)),
    creditHistory: [...creditHistoryMap.values()],
    categoryBreakdown: [...categories.entries()].map(([name, value]) => ({ name, value })),
  });
}));

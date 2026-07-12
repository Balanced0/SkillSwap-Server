import type { Types } from "mongoose";
import type { ListingDocument, ReviewDocument, SessionDocument, TransactionDocument, UserDocument } from "../models/index.js";

function plain<T>(value: T): T {
  const candidate = value as T & { toObject?: () => T };
  return candidate.toObject ? candidate.toObject() : value;
}

function identifier(value: Types.ObjectId | { _id: Types.ObjectId }) {
  return (typeof value === "object" && "_id" in value ? value._id : value).toString();
}

export function serializeUser(user: UserDocument) {
  const source = plain(user);
  return {
    _id: identifier(source),
    name: source.name,
    email: source.email,
    avatarUrl: source.avatarUrl,
    bio: source.bio,
    location: source.location,
    skillsOffered: source.skillsOffered,
    skillsWanted: source.skillsWanted,
    creditBalance: source.creditBalance,
    averageRating: source.averageRating,
    sessionsCompleted: source.sessionsCompleted,
    createdAt: source.createdAt,
  };
}

export function serializeTeacher(user: UserDocument) {
  const source = plain(user);
  return {
    _id: identifier(source),
    name: source.name,
    avatarUrl: source.avatarUrl,
    location: source.location,
    averageRating: source.averageRating,
    sessionsCompleted: source.sessionsCompleted,
  };
}

export function serializeListing(listing: ListingDocument) {
  const source = plain(listing);
  const teacher = source.userId as unknown as UserDocument;
  return {
    _id: identifier(source),
    title: source.title,
    category: source.category,
    tags: source.tags,
    description: source.description,
    level: source.level,
    availability: source.availability,
    imageUrl: source.imageUrl,
    status: source.status,
    createdAt: source.createdAt,
    teacher: serializeTeacher(teacher),
  };
}

export function serializeSession(session: SessionDocument) {
  const source = plain(session);
  const listing = source.listingId as unknown as ListingDocument;
  const teacher = source.teacherId as unknown as UserDocument;
  const learner = source.learnerId as unknown as UserDocument;
  return {
    _id: identifier(source),
    listing: { _id: identifier(listing), title: listing.title, category: listing.category },
    teacher: { _id: identifier(teacher), name: teacher.name, avatarUrl: teacher.avatarUrl, location: teacher.location },
    learner: { _id: identifier(learner), name: learner.name, avatarUrl: learner.avatarUrl, location: learner.location },
    skillName: source.skillName,
    proposedTime: source.proposedTime,
    durationHours: source.durationHours,
    status: source.status,
    teacherConfirmedComplete: source.teacherConfirmedComplete,
    learnerConfirmedComplete: source.learnerConfirmedComplete,
    createdAt: source.createdAt,
  };
}

export function serializeReview(review: ReviewDocument) {
  const source = plain(review);
  const reviewer = source.reviewerId as unknown as UserDocument;
  return {
    _id: identifier(source),
    rating: source.rating,
    comment: source.comment,
    createdAt: source.createdAt,
    reviewer: { _id: identifier(reviewer), name: reviewer.name, avatarUrl: reviewer.avatarUrl },
  };
}

export function serializeTransaction(transaction: TransactionDocument, runningBalance: number) {
  const source = plain(transaction);
  const counterparty = (source.type === "Earned" ? source.fromUserId : source.toUserId) as unknown as UserDocument;
  return {
    _id: identifier(source),
    createdAt: source.createdAt,
    skillName: source.skillName,
    credits: source.credits,
    type: source.type,
    counterparty: { _id: identifier(counterparty), name: counterparty.name },
    runningBalance,
  };
}

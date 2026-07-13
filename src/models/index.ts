import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";
import { SESSION_STATUSES, SKILL_CATEGORIES, SKILL_LEVELS, type SessionStatus, type SkillCategory, type SkillLevel } from "../constants.js";

type OfferedSkill = { skillName: string; category: SkillCategory; level: SkillLevel };
type WantedSkill = { skillName: string; category: SkillCategory };
type Availability = { day: string; timeSlots: string[] };

export type IUser = {
  authUserId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  skillsOffered: OfferedSkill[];
  skillsWanted: WantedSkill[];
  creditBalance: number;
  averageRating: number;
  sessionsCompleted: number;
  createdAt: Date;
  updatedAt: Date;
};

export type IListing = {
  userId: Types.ObjectId;
  title: string;
  category: SkillCategory;
  tags: string[];
  description: string;
  level: SkillLevel;
  availability: Availability[];
  imageUrl?: string;
  status: "Active" | "Paused";
  createdAt: Date;
  updatedAt: Date;
};

export type ISession = {
  listingId: Types.ObjectId;
  teacherId: Types.ObjectId;
  learnerId: Types.ObjectId;
  skillName: string;
  proposedTime: Date;
  durationHours: number;
  status: SessionStatus;
  teacherConfirmedComplete: boolean;
  learnerConfirmedComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ITransaction = {
  sessionId: Types.ObjectId;
  fromUserId: Types.ObjectId;
  toUserId: Types.ObjectId;
  skillName: string;
  credits: number;
  type: "Earned" | "Spent";
  createdAt: Date;
  updatedAt: Date;
};

export type IReview = {
  sessionId: Types.ObjectId;
  reviewerId: Types.ObjectId;
  revieweeId: Types.ObjectId;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserDocument = HydratedDocument<IUser>;
export type ListingDocument = HydratedDocument<IListing>;
export type SessionDocument = HydratedDocument<ISession>;
export type TransactionDocument = HydratedDocument<ITransaction>;
export type ReviewDocument = HydratedDocument<IReview>;

const offeredSkillSchema = new Schema<OfferedSkill>({
  skillName: { type: String, required: true, trim: true, maxlength: 80 },
  category: { type: String, required: true, enum: SKILL_CATEGORIES },
  level: { type: String, required: true, enum: SKILL_LEVELS },
}, { _id: false });

const wantedSkillSchema = new Schema<WantedSkill>({
  skillName: { type: String, required: true, trim: true, maxlength: 80 },
  category: { type: String, required: true, enum: SKILL_CATEGORIES },
}, { _id: false });

const availabilitySchema = new Schema<Availability>({
  day: { type: String, required: true, trim: true, maxlength: 80 },
  timeSlots: [{ type: String, trim: true, maxlength: 80 }],
}, { _id: false });

const userSchema = new Schema<IUser>({
  authUserId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 320 },
  avatarUrl: { type: String, trim: true, maxlength: 2048 },
  bio: { type: String, trim: true, maxlength: 600 },
  location: { type: String, trim: true, maxlength: 120 },
  skillsOffered: { type: [offeredSkillSchema], default: [] },
  skillsWanted: { type: [wantedSkillSchema], default: [] },
  creditBalance: { type: Number, default: 2, min: 0 },
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  sessionsCompleted: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

const listingSchema = new Schema<IListing>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 90 },
  category: { type: String, required: true, enum: SKILL_CATEGORIES, index: true },
  tags: [{ type: String, trim: true, maxlength: 40 }],
  description: { type: String, required: true, trim: true, minlength: 20, maxlength: 3000 },
  level: { type: String, required: true, enum: SKILL_LEVELS, index: true },
  availability: { type: [availabilitySchema], default: [] },
  imageUrl: { type: String, trim: true, maxlength: 2048 },
  status: { type: String, enum: ["Active", "Paused"], default: "Active", index: true },
}, { timestamps: true });
listingSchema.index({ title: "text", description: "text", tags: "text" });

const sessionSchema = new Schema<ISession>({
  listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
  teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  learnerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  skillName: { type: String, required: true, trim: true, maxlength: 90 },
  proposedTime: { type: Date, required: true },
  durationHours: { type: Number, default: 1, min: 1, max: 1 },
  status: { type: String, enum: SESSION_STATUSES, default: "Requested", index: true },
  teacherConfirmedComplete: { type: Boolean, default: false },
  learnerConfirmedComplete: { type: Boolean, default: false },
}, { timestamps: true });

const transactionSchema = new Schema<ITransaction>({
  sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true, index: true },
  fromUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  toUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  skillName: { type: String, required: true, trim: true, maxlength: 90 },
  credits: { type: Number, required: true, min: 1 },
  type: { type: String, enum: ["Earned", "Spent"], required: true },
}, { timestamps: true });
transactionSchema.index({ sessionId: 1, type: 1 }, { unique: true });

const reviewSchema = new Schema<IReview>({
  sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true, index: true },
  reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  revieweeId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true, trim: true, minlength: 3, maxlength: 600 },
}, { timestamps: true });
reviewSchema.index({ sessionId: 1, reviewerId: 1 }, { unique: true });

export type IWant = {
  userId: Types.ObjectId;
  skillName: string;
  category: SkillCategory;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

export type WantDocument = HydratedDocument<IWant>;

const wantSchema = new Schema<IWant>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  skillName: { type: String, required: true, trim: true, minlength: 3, maxlength: 90 },
  category: { type: String, required: true, enum: SKILL_CATEGORIES, index: true },
  description: { type: String, required: true, trim: true, minlength: 20, maxlength: 3000 },
}, { timestamps: true });
wantSchema.index({ skillName: "text", description: "text" });

export const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
export const Listing = mongoose.models.Listing || mongoose.model<IListing>("Listing", listingSchema);
export const Session = mongoose.models.Session || mongoose.model<ISession>("Session", sessionSchema);
export const Transaction = mongoose.models.Transaction || mongoose.model<ITransaction>("Transaction", transactionSchema);
export const Review = mongoose.models.Review || mongoose.model<IReview>("Review", reviewSchema);
export const Want = mongoose.models.Want || mongoose.model<IWant>("Want", wantSchema);


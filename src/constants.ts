export const SKILL_CATEGORIES = ["Music", "Coding", "Language", "Design", "Fitness", "Cooking", "Art", "Business", "Other"] as const;
export const SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export const SESSION_STATUSES = ["Requested", "Confirmed", "Completed", "Cancelled", "Declined"] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];

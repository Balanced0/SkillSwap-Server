import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { betterAuth } from "better-auth";
import { MongoClient } from "mongodb";
import { env } from "./config/env.js";

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} must be set before starting the SkillSwap API.`);
  return value;
}

export const authMongoClient = new MongoClient(env.mongoUri);

export const auth = betterAuth({
  database: mongodbAdapter(authMongoClient.db("skillswap"), { client: authMongoClient }),
  baseURL: env.betterAuthUrl,
  secret: required("BETTER_AUTH_SECRET", env.betterAuthSecret),
  trustedOrigins: env.clientOrigins,
  advanced: {
    useSecureCookies: true,
    cookie: {
      sameSite: "none",
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: required("GOOGLE_CLIENT_ID", env.googleClientId),
      clientSecret: required("GOOGLE_CLIENT_SECRET", env.googleClientSecret),
      prompt: "select_account",
    },
  },
});

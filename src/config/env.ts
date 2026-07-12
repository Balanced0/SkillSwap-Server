import "dotenv/config";

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

export const env = {
  port,
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/skillswap",
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:3000").split(",").map((origin) => origin.trim()),
  betterAuthUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  betterAuthSecret: process.env.BETTER_AUTH_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
};

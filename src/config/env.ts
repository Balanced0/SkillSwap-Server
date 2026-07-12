import "dotenv/config";

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production.");
}

export const env = {
  port,
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/skillswap",
  jwtSecret: process.env.JWT_SECRET ?? "skillswap-development-secret-change-me",
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:3000").split(",").map((origin) => origin.trim()),
};

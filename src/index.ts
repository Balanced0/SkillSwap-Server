import cors from "cors";
import express from "express";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { errorHandler } from "./lib/errors.js";
import { authRouter } from "./routes/auth.js";
import { listingsRouter } from "./routes/listings.js";
import { platformRouter } from "./routes/platform.js";
import { reviewsRouter } from "./routes/reviews.js";
import { sessionsRouter } from "./routes/sessions.js";

export const app = express();

app.use(cors({
  origin(origin, callback) {
    if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/listings", listingsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api", platformRouter);
app.use((_request, response) => response.status(404).json({ message: "Route not found." }));
app.use(errorHandler);

async function start() {
  await connectDatabase();
  app.listen(env.port, () => console.info(`SkillSwap API listening on http://localhost:${env.port}`));
}

void start().catch((error: unknown) => {
  console.error("Failed to start SkillSwap API", error);
  process.exitCode = 1;
});

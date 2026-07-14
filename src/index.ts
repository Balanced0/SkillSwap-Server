import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import { auth } from "./auth.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { errorHandler } from "./lib/errors.js";
import { listingsRouter } from "./routes/listings.js";
import { membersRouter } from "./routes/members.js";
import { platformRouter } from "./routes/platform.js";
import { reviewsRouter } from "./routes/reviews.js";
import { sessionsRouter } from "./routes/sessions.js";
import { wantsRouter } from "./routes/wants.js";

export const app = express();

app.use(cors({
  origin(origin, callback) {
    if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
  credentials: true,
}));

const authHandler = toNodeHandler(auth);
app.all("/api/auth/{*any}", (request, response, next) => { void authHandler(request, response).catch(next); });
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
app.use("/api/members", membersRouter);
app.use("/api/listings", listingsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/wants", wantsRouter);
app.use("/api", platformRouter);
app.use((_request, response) => response.status(404).json({ message: "Route not found." }));
app.use(errorHandler);

async function start() {
  await connectDatabase();
  app.listen(env.port, () => console.info(`SkillSwap API listening on http://localhost:${env.port}`));
}

if (process.env.VERCEL !== "1") {
  void start().catch((error: unknown) => {
    console.error("Failed to start SkillSwap API", error);
    process.exitCode = 1;
  });
} else {
  void connectDatabase().catch((error: unknown) => {
    console.error("Failed to connect to database on Vercel boot", error);
  });
}

export default app;

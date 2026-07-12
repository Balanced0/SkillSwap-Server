import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongoUri);
  console.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

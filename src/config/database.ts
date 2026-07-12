import mongoose from "mongoose";
import { authMongoClient } from "../auth.js";
import { env } from "./env.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await Promise.all([mongoose.connect(env.mongoUri), authMongoClient.connect()]);
  console.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

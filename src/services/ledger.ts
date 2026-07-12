import { Transaction, type TransactionDocument } from "../models/index.js";
import { serializeTransaction } from "../lib/serializers.js";

export async function getLedger(userId: string) {
  const transactions = await Transaction.find({ $or: [{ fromUserId: userId }, { toUserId: userId }] })
    .sort({ createdAt: 1 })
    .populate("fromUserId", "name")
    .populate("toUserId", "name");

  let balance = 2;
  const chronological = transactions.map((transaction) => {
    balance += transaction.type === "Earned" ? transaction.credits : -transaction.credits;
    return serializeTransaction(transaction as TransactionDocument, balance);
  });
  return { balance, transactions: chronological.reverse() };
}

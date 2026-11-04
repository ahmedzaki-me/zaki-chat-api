import { Router } from "express";
import { clear, list, send } from "../controllers/message.controller.ts";

// Mounted under /conversations/:id/messages, after requireAuth.
export const messagesRouter = Router({ mergeParams: true });

messagesRouter.get("/", list);
messagesRouter.post("/", send);
messagesRouter.delete("/", clear); // owner only, hard delete of every message

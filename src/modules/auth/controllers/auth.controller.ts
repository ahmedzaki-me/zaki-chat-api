import type { RequestHandler } from "express";
import {
  guestSchema,
  loginSchema,
  signupSchema,
  upgradeSchema,
} from "../schemas/auth.schemas.ts";
import {
  getCurrentUser,
  loginUser,
  registerGuest,
  registerUser,
  upgradeGuest,
} from "../services/auth.service.ts";
import { sendSession, sessionMeta, toPublicUser } from "./auth.http.ts";

export const guest: RequestHandler = async (req, res) => {
  const input = guestSchema.parse(req.body);
  await sendSession(res, 201, await registerGuest(input, sessionMeta(req)));
};

export const signup: RequestHandler = async (req, res) => {
  const input = signupSchema.parse(req.body);
  await sendSession(res, 201, await registerUser(input, sessionMeta(req)));
};

export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  await sendSession(res, 200, await loginUser(input, sessionMeta(req)));
};

export const upgrade: RequestHandler = async (req, res) => {
  const input = upgradeSchema.parse(req.body);
  const user = await upgradeGuest(req.auth!.id, input);
  res.json({ user: await toPublicUser(user) });
};

export const me: RequestHandler = async (req, res) => {
  const user = await getCurrentUser(req.auth!.id);
  res.json({ user: await toPublicUser(user) });
};

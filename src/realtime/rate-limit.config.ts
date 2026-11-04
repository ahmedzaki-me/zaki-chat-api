export const SOCKET_EVENT_RATE_LIMITS = {
  message: { max: 30, windowMs: 10_000 },
  read: { max: 60, windowMs: 10_000 },
  typing: { max: 40, windowMs: 10_000 },
  other: { max: 20, windowMs: 10_000 },
} as const;

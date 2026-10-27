import type { Request } from 'express';

export type RequestWithId = Request & { id: string };

export type HealthCheck = {
  status: 'up' | 'down';
  latencyMs?: number;
  detail?: string;
};

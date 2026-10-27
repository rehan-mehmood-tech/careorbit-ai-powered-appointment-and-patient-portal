import type { Request } from 'express';

export type RequestWithId = Request & { id: string };

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type HealthCheck = {
  status: 'up' | 'down';
  latencyMs?: number;
  detail?: string;
};

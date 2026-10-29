import type { Config } from '@netlify/functions';
import { cfg, json } from '../lib/common.mts';

// Diagnóstico público e mínimo: só diz se está configurado. Detalhes ficam em /api/admin/diag (exige login).
export default async () => json({ ok: true, configured: cfg() !== null });

export const config: Config = { path: '/health', method: 'GET', rateLimit: { action: 'rate_limit', windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] } };

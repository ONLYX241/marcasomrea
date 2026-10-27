import type { Config } from '@netlify/functions';
import { cfg, configProblems, json } from '../lib/common.mts';

// Diagnóstico: mostra se as variáveis de ambiente estão completas (sem revelar valores).
export default async () => json({ ok: true, configured: cfg() !== null, problemas: configProblems() });

export const config: Config = { path: '/health', method: 'GET' };

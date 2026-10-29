import type { Config } from '@netlify/functions';
import { badConfig, cfg, devicesStore, hashKey, json, licensesStore, now, guard, parseBody, usageStore, weekInfo, weeklyOf, type License } from '../lib/common.mts';

// 4) valida a chave + limite de aparelhos
export default async (req: Request) => {
  const c = cfg();
  if (!c) return badConfig();
  const g = guard(req); if (g) return g;
  const p = await parseBody(req, { key: ['s', 64, true], device: ['s', 64, true] });
  if (!p.ok) return p.res;
  const b = p.d;
  const key = String(b.key || '').trim().toUpperCase();
  const device = String(b.device || '');
  if (!/^MS-([A-Z2-9]{5}-){3}[A-Z2-9]{5}$/.test(key) || !/^[a-f0-9]{32}$/.test(device)) return json({ valid: false });

  const h = hashKey(c.pepper, key);
  const L = await licensesStore().get(h, { type: 'json' }) as License | null;
  if (!L || L.revoked) return json({ valid: false });
  if (L.expires_at && L.expires_at < now()) return json({ valid: false, reason: 'expired' });

  const D = devicesStore();
  const maxDev = L.max_devices || c.maxDevices;
  const dk = `${h}/${device}`;
  if ((await D.get(dk)) === null) {
    const antes = await D.list({ prefix: h + '/' });
    if (antes.blobs.length >= maxDev) return json({ valid: false, reason: 'device-limit' });
    await D.set(dk, String(now()), { onlyIfNew: true });
    // se dois aparelhos novos entraram ao mesmo tempo, o excedente é recusado
    const depois = await D.list({ prefix: h + '/' });
    if (depois.blobs.length > maxDev) { await D.delete(dk); return json({ valid: false, reason: 'device-limit' }); }
  }
  // quanto do limite semanal já foi usado (null = plano sem limite)
  const lim = weeklyOf(L.plan);
  let weekly: { limit: number; used: number; resetsAt: number } | null = null;
  if (lim != null) {
    const wk = weekInfo();
    const u = await usageStore().get(`${h}/${wk.id}`, { type: 'json' }) as { n?: number } | null;
    weekly = { limit: lim, used: Math.min(lim, Math.max(0, Number(u?.n) || 0)), resetsAt: wk.resetsAt };
  }
  return json({ valid: true, plan: L.plan, expiresAt: L.expires_at, weekly });
};

export const config: Config = {
  path: '/api/validate',
  method: 'POST',
  rateLimit: { action: 'rate_limit', windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

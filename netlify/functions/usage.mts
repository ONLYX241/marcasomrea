import type { Config } from '@netlify/functions';
import { badConfig, cfg, json, loadLicense, newOrderId, now, guard, parseBody, usageChange, usageStore, weekInfo, weeklyOf } from '../lib/common.mts';

// 5) limite semanal de músicas.
//   reserve: o site pede X músicas ANTES de processar; o servidor concede até o que sobrar da semana.
//   settle:  ao terminar (ou cancelar), o site devolve as que não foram usadas. Cada reserva só pode ser devolvida uma vez.
//   status:  só consulta.
export default async (req: Request) => {
  const c = cfg();
  if (!c) return badConfig();
  const g = guard(req); if (g) return g;
  const p = await parseBody(req, { key: ['s', 64, true], device: ['s', 64, true], action: ['s', 10], count: ['n', 10000], ticket: ['s', 64] });
  if (!p.ok) return p.res;
  const b = p.d;
  const ok = await loadLicense(c.pepper, b.key, b.device);
  if (!ok) return json({ error: 'Chave inválida.' }, 403);
  const { h, L } = ok;
  const limit = weeklyOf(L.plan), w = weekInfo(), S = usageStore();
  const action = String(b.action || 'status');
  const count = Math.max(0, Math.min(5000, Math.floor(Number(b.count) || 0)));

  const view = async (week = w.id, extra: Record<string, unknown> = {}) => {
    const cur = await S.get(`${h}/${week}`, { type: 'json' }) as { n?: number } | null;
    const used = Math.max(0, Number(cur?.n) || 0);
    return json({ limit, used, remaining: limit == null ? null : Math.max(0, limit - used), resetsAt: w.resetsAt, week, ...extra });
  };

  if (limit == null) return json({ limit: null, used: 0, remaining: null, granted: count, resetsAt: w.resetsAt, week: w.id });

  if (action === 'reserve') {
    if (!count) return json({ error: 'Quantidade inválida.' }, 400);
    const r = await usageChange(h, w.id, count, limit);
    if (!r.applied) return json({ limit, used: r.used, remaining: Math.max(0, limit - r.used), granted: 0, resetsAt: w.resetsAt, week: w.id });
    const ticket = newOrderId();
    await S.setJSON(`t/${h}/${ticket}`, { n: r.applied, back: 0, week: w.id, ts: now() });
    return json({ limit, used: r.used, remaining: Math.max(0, limit - r.used), granted: r.applied, resetsAt: w.resetsAt, week: w.id, ticket });
  }

  if (action === 'settle') {
    const ticket = String(b.ticket || '');
    if (!/^[a-f0-9]{32}$/.test(ticket) || !count) return view();
    for (let i = 0; i < 4; i++) {
      const cur = await S.getWithMetadata(`t/${h}/${ticket}`, { type: 'json' });
      if (!cur) return view();
      const t = cur.data as { n: number; back: number; week: string };
      const refund = Math.min(count, t.n - t.back);
      if (refund <= 0) return view(t.week);
      // primeiro marca a devolução no recibo (impede devolver duas vezes), depois mexe no contador
      const wr = await S.setJSON(`t/${h}/${ticket}`, { ...t, back: t.back + refund }, { onlyIfMatch: cur.etag });
      if (!wr.modified) continue;
      await usageChange(h, t.week, -refund, limit);
      return view(t.week);
    }
    return view();
  }

  return view();
};

export const config: Config = {
  path: '/api/usage',
  method: 'POST',
  rateLimit: { action: 'rate_limit', windowLimit: 40, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

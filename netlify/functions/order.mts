import type { Config, Context } from '@netlify/functions';
import { json, now, ordersStore, type Order } from '../lib/common.mts';

// 3) o site pergunta se já pagou (e recebe a chave, uma vez, por até 24h)
export default async (_req: Request, context: Context) => {
  const id = String(context.params.id || '');
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'Pedido inválido.' }, 400);
  const S = ordersStore();
  const o = await S.get(id, { type: 'json' }) as Order | null;
  if (!o) return json({ error: 'Pedido não encontrado.' }, 404);
  const out: { status: string; key?: string; plan?: string } = { status: o.status };
  if (o.status === 'approved' && o.key_plain && (o.key_until || 0) > now()) { out.key = o.key_plain; out.plan = o.plan; }
  else if (o.key_plain && (o.key_until || 0) <= now()) await S.setJSON(id, { ...o, key_plain: null }); // apaga a chave em texto puro após 24h
  return json(out);
};

export const config: Config = {
  path: '/api/order/:id',
  method: 'GET',
  rateLimit: { action: 'rate_limit', windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

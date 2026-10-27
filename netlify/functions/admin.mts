import type { Config } from '@netlify/functions';
import { badConfig, cfg, code, devicesStore, json, licensesStore, ordersStore, readJson, safeEq, type License, type Order } from '../lib/common.mts';

// Admin: autenticação por "Authorization: Bearer <ADMIN_TOKEN>"
export default async (req: Request) => {
  const c = cfg();
  if (!c) return badConfig();
  const tok = String(req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!safeEq(tok, c.adminToken)) return code(401);
  const path = new URL(req.url).pathname;

  // licenças de um e-mail
  const doEmail = async (email: string) => {
    const S = licensesStore();
    const { blobs } = await S.list();
    const out: { hash: string; lic: License }[] = [];
    for (const { key } of blobs) {
      const lic = await S.get(key, { type: 'json' }) as License | null;
      if (lic && lic.email === email) out.push({ hash: key, lic });
    }
    return out;
  };

  if (req.method === 'GET' && path === '/api/admin/orders') {
    const S = ordersStore();
    const { blobs } = await S.list();
    const all = (await Promise.all(blobs.slice(0, 500).map(async ({ key }) => await S.get(key, { type: 'json' }) as Order | null)))
      .filter((o): o is Order => !!o)
      .sort((a, b) => b.created_at - a.created_at).slice(0, 100)
      .map(o => ({ id: o.id, plan: o.plan, name: o.name || '', email: o.email, phone: o.phone || '', amount: o.amount, status: o.status, created_at: o.created_at }));
    return json(all);
  }
  // clientes: uma linha por e-mail, com nome, WhatsApp e todas as licenças (plano, validade, aparelhos em uso, final da chave)
  if (req.method === 'GET' && path === '/api/admin/customers') {
    const L = licensesStore(), D = devicesStore();
    const { blobs } = await L.list();
    const keys = blobs.slice(0, 1000).map(b => b.key);
    const rows: { lic: License; devices: number }[] = [];
    for (let i = 0; i < keys.length; i += 20) {
      const part = await Promise.all(keys.slice(i, i + 20).map(async (h) => {
        const lic = await L.get(h, { type: 'json' }) as License | null;
        if (!lic) return null;
        const dev = await D.list({ prefix: h + '/' });
        return { lic, devices: dev.blobs.length };
      }));
      for (const r of part) if (r) rows.push(r);
    }
    rows.sort((a, b) => a.lic.created_at - b.lic.created_at); // a compra mais nova por último: o nome/WhatsApp dela prevalece
    const by = new Map<string, { email: string; name: string; phone: string; purchases: unknown[] }>();
    for (const { lic, devices } of rows) {
      const cu = by.get(lic.email) || { email: lic.email, name: '', phone: '', purchases: [] };
      if (lic.name) cu.name = lic.name;
      if (lic.phone) cu.phone = lic.phone;
      cu.purchases.push({ order_id: lic.order_id, plan: lic.plan, created_at: lic.created_at, expires_at: lic.expires_at, revoked: lic.revoked, devices, hint: lic.hint || '' });
      by.set(lic.email, cu);
    }
    const out = [...by.values()].sort((a: any, b: any) => b.purchases[b.purchases.length - 1].created_at - a.purchases[a.purchases.length - 1].created_at);
    return json({ maxDevices: c.maxDevices, customers: out });
  }
  if (req.method === 'POST' && path === '/api/admin/revoke') {
    const email = String((await readJson(req)).email || '').toLowerCase();
    const list = await doEmail(email);
    for (const { hash, lic } of list) await licensesStore().setJSON(hash, { ...lic, revoked: true });
    return json({ revoked: list.length });
  }
  if (req.method === 'POST' && path === '/api/admin/reset-devices') {
    const email = String((await readJson(req)).email || '').toLowerCase();
    const D = devicesStore();
    let n = 0;
    for (const { hash } of await doEmail(email)) {
      const { blobs } = await D.list({ prefix: hash + '/' });
      for (const { key } of blobs) { await D.delete(key); n++; }
    }
    return json({ cleared: n });
  }
  return code(404);
};

export const config: Config = {
  path: ['/api/admin/orders', '/api/admin/customers', '/api/admin/revoke', '/api/admin/reset-devices'],
  method: ['GET', 'POST'],
  rateLimit: { action: 'rate_limit', windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

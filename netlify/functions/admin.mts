import type { Config, Context } from '@netlify/functions';
import { apiKeyInfo, configProblems, guard, jsonH, lockCheck, lockClear, lockFail, makeSession, parseBody, sessionCookie, sessionOk, badConfig, cfg, cleanName, cleanPhone, code, devicesStore, hashKey, json, licensesStore, newLicenseKey, newOrderId, now, ordersStore, PLANS, safeEq, usageStore, weekInfo, weeklyOf, type License, type Order } from '../lib/common.mts';

// Admin: autenticação por "Authorization: Bearer <ADMIN_TOKEN>"
export default async (req: Request, context: Context) => {
  const c = cfg();
  if (!c) return badConfig();
  const gd = guard(req, context, { admin: true });
  if (gd) return gd;
  const path = new URL(req.url).pathname, ip = context?.ip || '';

  // Login: troca o token por um cookie HttpOnly (o token não fica no navegador). 5 erros = bloqueio de 15 min por IP.
  if (req.method === 'POST' && path === '/api/admin/login') {
    const lk = await lockCheck(ip);
    if (lk.locked) return code(429);
    const p = await parseBody(req, { token: ['s', 256, true] });
    if (!p.ok) return p.res;
    if (!safeEq(p.d.token, c.adminToken)) { await lockFail(lk.k, lk.n); return code(401); }
    await lockClear(lk.k);
    return jsonH({ ok: true }, 200, { 'set-cookie': sessionCookie(makeSession(c.pepper)) });
  }
  if (req.method === 'POST' && path === '/api/admin/logout') return jsonH({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });

  // Demais rotas: cookie de sessão OU "Authorization: Bearer <ADMIN_TOKEN>" (uso por API)
  const bearer = String(req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!sessionOk(c.pepper, req)) {
    if (!bearer) return code(401);
    const lk = await lockCheck(ip);
    if (lk.locked) return code(429);
    if (!safeEq(bearer, c.adminToken)) { await lockFail(lk.k, lk.n); return code(401); }
    await lockClear(lk.k);
  }
  const body = async (spec: Parameters<typeof parseBody>[1]) => parseBody(req, spec);

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
    const rows: { lic: License; devices: number; week: { used: number; limit: number } | null }[] = [];
    const US = usageStore(), wk = weekInfo();
    for (let i = 0; i < keys.length; i += 20) {
      const part = await Promise.all(keys.slice(i, i + 20).map(async (h) => {
        const lic = await L.get(h, { type: 'json' }) as License | null;
        if (!lic) return null;
        const dev = await D.list({ prefix: h + '/' });
        const lim = weeklyOf(lic.plan);
        let week: { used: number; limit: number } | null = null;
        if (lim != null) { const u = await US.get(`${h}/${wk.id}`, { type: 'json' }) as { n?: number } | null; week = { used: Math.max(0, Number(u?.n) || 0), limit: lim }; }
        return { lic, devices: dev.blobs.length, week };
      }));
      for (const r of part) if (r) rows.push(r);
    }
    rows.sort((a, b) => a.lic.created_at - b.lic.created_at); // a compra mais nova por último: o nome/WhatsApp dela prevalece
    const by = new Map<string, { email: string; name: string; phone: string; purchases: unknown[] }>();
    for (const { lic, devices, week } of rows) {
      const cu = by.get(lic.email) || { email: lic.email, name: '', phone: '', purchases: [] };
      if (lic.name) cu.name = lic.name;
      if (lic.phone) cu.phone = lic.phone;
      cu.purchases.push({ order_id: lic.order_id, plan: lic.plan, created_at: lic.created_at, expires_at: lic.expires_at, revoked: lic.revoked, devices, max: lic.max_devices || c.maxDevices, week, hint: lic.hint || '' });
      by.set(lic.email, cu);
    }
    const out = [...by.values()].sort((a: any, b: any) => b.purchases[b.purchases.length - 1].created_at - a.purchases[a.purchases.length - 1].created_at);
    return json({ maxDevices: c.maxDevices, customers: out });
  }
  // libera uma chave sem pagamento: administrador/teste (sem vencimento, 20 aparelhos) ou venda feita por fora (plano normal).
  // A chave aparece UMA vez na resposta; no servidor fica só o hash.
  if (req.method === 'POST' && path === '/api/admin/grant') {
    const p = await body({ email: ['s', 254, true], plan: ['s', 20], name: ['s', 80], phone: ['s', 40] });
    if (!p.ok) return p.res;
    const b = p.d;
    const email = String(b.email || '').trim().toLowerCase();
    const plan = String(b.plan || 'admin');
    if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) || email.length > 254) return json({ error: 'E-mail inválido.' }, 400);
    if (plan !== 'admin' && !PLANS[plan]) return json({ error: 'Plano inválido.' }, 400);
    const key = newLicenseKey(), h = hashKey(c.pepper, key);
    const days = plan === 'admin' ? null : PLANS[plan].days;
    const lic: License = {
      plan, email, order_id: 'manual-' + newOrderId().slice(0, 8),
      expires_at: days ? now() + days * 86400000 : null, revoked: false, created_at: now(),
      name: cleanName(b.name), phone: cleanPhone(b.phone), hint: key.slice(-5),
      ...(plan === 'admin' ? { max_devices: 20 } : {}),
    };
    await licensesStore().setJSON(h, lic, { onlyIfNew: true });
    return json({ key, plan, expires_at: lic.expires_at });
  }
  if (req.method === 'POST' && path === '/api/admin/revoke') {
    const p = await body({ email: ['s', 254, true] });
    if (!p.ok) return p.res;
    const email = String(p.d.email).trim().toLowerCase();
    const list = await doEmail(email);
    for (const { hash, lic } of list) await licensesStore().setJSON(hash, { ...lic, revoked: true });
    return json({ revoked: list.length });
  }
  // devolve o limite da semana (suporte: cliente que perdeu músicas por queda de internet, por exemplo)
  if (req.method === 'POST' && path === '/api/admin/reset-week') {
    const p = await body({ email: ['s', 254, true] });
    if (!p.ok) return p.res;
    const email = String(p.d.email).trim().toLowerCase();
    const wk = weekInfo();
    let n = 0;
    for (const { hash } of await doEmail(email)) { await usageStore().delete(`${hash}/${wk.id}`); n++; }
    return json({ reset: n });
  }
  if (req.method === 'POST' && path === '/api/admin/reset-devices') {
    const p = await body({ email: ['s', 254, true] });
    if (!p.ok) return p.res;
    const email = String(p.d.email).trim().toLowerCase();
    const D = devicesStore();
    let n = 0;
    for (const { hash } of await doEmail(email)) {
      const { blobs } = await D.list({ prefix: hash + '/' });
      for (const { key } of blobs) { await D.delete(key); n++; }
    }
    return json({ cleared: n });
  }
  // diagnóstico da configuração (só para quem está logado)
  if (req.method === 'GET' && path === '/api/admin/diag') return json({ configured: true, problemas: configProblems(), chaveAtenasPay: apiKeyInfo() });
  // cifra os registros antigos (feitos antes da criptografia). Pode rodar mais de uma vez.
  if (req.method === 'POST' && path === '/api/admin/encrypt-existing') {
    let n = 0;
    for (const S of [licensesStore(), ordersStore()]) {
      const { blobs } = await S.list();
      for (const { key } of blobs) { const o = await S.get(key); if (o) { await S.setJSON(key, o); n++; } }
    }
    return json({ rewritten: n });
  }
  return code(404);
};

export const config: Config = {
  path: ['/api/admin/orders', '/api/admin/customers', '/api/admin/grant', '/api/admin/revoke', '/api/admin/reset-week', '/api/admin/reset-devices', '/api/admin/login', '/api/admin/logout', '/api/admin/diag', '/api/admin/encrypt-existing'],
  method: ['GET', 'POST'],
  rateLimit: { action: 'rate_limit', windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

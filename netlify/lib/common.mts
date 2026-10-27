// Código compartilhado das funções do MarcaSom (Pix via AtenasPay).
// Fica FORA de netlify/functions para não virar uma função por engano.
import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

declare const Netlify: { env: { get(k: string): string | undefined } };

// ---------- Configuração ----------
// Nomes (nunca valores) das variáveis ausentes ou curtas demais, para diagnóstico.
export function configProblems(): string[] {
  const g = (k: string) => clean(Netlify.env.get(k));
  const out: string[] = [];
  for (const k of ['ATENAS_API_KEY', 'ATENAS_WEBHOOK_SECRET', 'LICENSE_PEPPER', 'ADMIN_TOKEN']) if (!g(k)) out.push(k + ' (vazia ou não existe)');
  for (const k of ['LICENSE_PEPPER', 'ADMIN_TOKEN']) if (g(k) && g(k).length < 32) out.push(k + ' (menos de 32 caracteres)');
  return out;
}

// Remove espaços, quebras de linha e aspas que costumam vir junto ao colar uma chave.
const clean = (v: string | undefined) => (v || '').trim().replace(/^["']+|["']+$/g, '').trim();

export function cfg() {
  const g = (k: string) => clean(Netlify.env.get(k));
  const c = {
    apiKey: g('ATENAS_API_KEY'),
    webhookSecret: g('ATENAS_WEBHOOK_SECRET'),
    base: (g('ATENAS_BASE_URL') || 'https://atenaspay.com.br').replace(/\/$/, ''),
    pepper: g('LICENSE_PEPPER'),
    adminToken: g('ADMIN_TOKEN'),
    maxDevices: Number(g('MAX_DEVICES')) || 2,
    // Em que unidade a AtenasPay espera o campo "amount": 'reais' (29.90) ou 'centavos' (2990).
    amountUnit: (g('AMOUNT_UNIT') || 'reais').toLowerCase() === 'centavos' ? 'centavos' : 'reais',
  };
  const missing = (['apiKey', 'webhookSecret', 'pepper', 'adminToken'] as const).filter(k => !c[k]);
  if (missing.length || c.pepper.length < 32 || c.adminToken.length < 32) {
    console.error('Configuração incompleta. Faltando/curto:', missing.join(',') || 'LICENSE_PEPPER/ADMIN_TOKEN (mín. 32 caracteres)');
    return null;
  }
  return c;
}

// Preços e prazos vivem SÓ aqui. O navegador nunca decide o valor.
export const PLANS: Record<string, { name: string; price: number; days: number | null }> = {
  mensal:     { name: 'MarcaSom Mensal',     price: 29.90,  days: 30 },
  trimestral: { name: 'MarcaSom Trimestral', price: 59.90,  days: 90 },
  vitalicio:  { name: 'MarcaSom Vitalício',  price: 129.90, days: null },
};
export const cents = (p: number) => Math.round(p * 100); // AtenasPay recebe centavos (5000 = R$ 50,00)
export const now = () => Date.now();

// ---------- Respostas ----------
const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: H });
export const code = (status: number) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });
export const badConfig = () => json({ error: 'Servidor de pagamentos não configurado.' }, 500);
export async function readJson(req: Request): Promise<any> {
  try { const t = await req.text(); return t.length > 16384 ? {} : JSON.parse(t || '{}'); } catch { return {}; }
}

// ---------- Armazenamento (Netlify Blobs, consistência forte) ----------
export type Order = {
  id: string; plan: string; email: string; amount: number; status: string;
  key_plain: string | null; key_until: number | null; lic: string | null; created_at: number;
};
export type License = { plan: string; email: string; order_id: string; expires_at: number | null; revoked: boolean; created_at: number };

export const ordersStore = () => getStore({ name: 'orders', consistency: 'strong' });
export const licensesStore = () => getStore({ name: 'licenses', consistency: 'strong' });
export const devicesStore = () => getStore({ name: 'devices', consistency: 'strong' });

// ---------- Criptografia ----------
export const hashKey = (pepper: string, k: string) => crypto.createHmac('sha256', pepper).update(k).digest('hex');
export const newOrderId = () => crypto.randomBytes(16).toString('hex'); // 128 bits
export function newLicenseKey() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
  const b = crypto.randomBytes(20);
  let s = '';
  for (let i = 0; i < 20; i++) s += alpha[b[i] % alpha.length];
  return 'MS-' + (s.match(/.{5}/g) as string[]).join('-');
}
export const safeEq = (a: unknown, b: unknown) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
export const hmacHex = (secret: string, msg: string) => crypto.createHmac('sha256', secret).update(msg).digest('hex');

// Valor do Pix escrito dentro do "copia e cola" (EMV, campo 54), ou null se não houver.
// Serve de trava: nunca mostramos ao cliente um Pix com valor diferente do plano.
export function emvAmount(emv: string): number | null {
  try {
    let i = 0;
    while (i + 4 <= emv.length) {
      const id = emv.slice(i, i + 2), len = Number(emv.slice(i + 2, i + 4));
      if (!Number.isInteger(len)) return null;
      const val = emv.slice(i + 4, i + 4 + len);
      if (id === '54') { const n = Number(val); return Number.isFinite(n) ? n : null; }
      i += 4 + len;
    }
  } catch { /* ignora */ }
  return null;
}

// ---------- AtenasPay ----------
export async function atenasCreate(c: { base: string; apiKey: string }, amountCents: number, externalId: string) {
  const r = await fetch(c.base + '/api/pix/create', {
    method: 'POST',
    headers: { 'x-api-key': c.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountCents, external_id: externalId }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error('AtenasPay HTTP ' + r.status); e.detail = j; throw e; }
  return j;
}

// Procura um campo em vários nomes possíveis, na raiz ou dentro de data/pix/payment.
export function pick(obj: any, names: string[]) {
  const boxes = [obj, obj?.transaction, obj?.data, obj?.data?.transaction, obj?.pix, obj?.payment, obj?.data?.pix].filter(x => x && typeof x === 'object');
  for (const b of boxes) for (const n of names) if (b[n] != null && b[n] !== '') return b[n];
  return null;
}

// ---------- Liberar licença (idempotente) ----------
// Webhook repetido NÃO gera 2ª chave: a troca de status é condicional (onlyIfMatch).
export async function approveOrder(pepper: string, orderId: string): Promise<boolean> {
  const S = ordersStore();
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const cur = await S.getWithMetadata(orderId, { type: 'json' });
    if (!cur) return false;
    const o = cur.data as Order;
    if (o.status === 'approved' || o.status === 'refunded') return false;
    const plan = PLANS[o.plan];
    if (!plan) return false;

    const key = newLicenseKey();
    const h = hashKey(pepper, key);
    const lic: License = {
      plan: o.plan, email: o.email, order_id: o.id,
      expires_at: plan.days ? now() + plan.days * 86400000 : null, revoked: false, created_at: now(),
    };
    await licensesStore().setJSON(h, lic, { onlyIfNew: true });
    const upd: Order = { ...o, status: 'approved', key_plain: key, key_until: now() + 24 * 3600 * 1000, lic: h };
    const w = await S.setJSON(orderId, upd, { onlyIfMatch: cur.etag });
    if (w.modified) return true;
    await licensesStore().delete(h); // perdeu a corrida: desfaz a licença criada e tenta de novo
  }
  return false;
}

// Diagnóstico seguro da chave da AtenasPay: só formato, nunca o valor completo.
export function apiKeyInfo() {
  const raw = Netlify.env.get('ATENAS_API_KEY') || '';
  const k = clean(raw);
  return {
    comecaCom: k.slice(0, 15),
    terminaCom: k.slice(-4),
    tamanho: k.length,
    tinhaEspacoOuQuebraDeLinha: raw !== raw.trim(),
    tinhaAspas: /^["']|["']$/.test(raw.trim()),
    colouONomeJuntoComOValor: /^ATENAS_API_KEY\s*=/.test(k),
  };
}

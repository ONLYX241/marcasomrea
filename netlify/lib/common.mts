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
    // Proteções opcionais
    turnstileSecret: g('TURNSTILE_SECRET'),            // Cloudflare Turnstile (anti-robô). Vazio = desligado.
    checkoutPaused: g('CHECKOUT_PAUSED') === '1',      // freio de emergência: pausa a criação de Pix
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
// weekly = limite de músicas por semana (null = sem limite). Mude o número aqui para mudar o limite.
export const PLANS: Record<string, { name: string; price: number; days: number | null; weekly: number | null }> = {
  mensal:     { name: 'MarcaSom Mensal',     price: 29.90,  days: 30,   weekly: 100 },
  trimestral: { name: 'MarcaSom Trimestral', price: 59.90,  days: 90,   weekly: 70 },
  vitalicio:  { name: 'MarcaSom Vitalício',  price: 129.90, days: null, weekly: null },
};
// chaves de administrador (plano 'admin') não estão em PLANS: sem limite semanal
export const weeklyOf = (plan: string): number | null => PLANS[plan]?.weekly ?? null;
export const cents = (p: number) => Math.round(p * 100); // AtenasPay recebe centavos (5000 = R$ 50,00)
export const now = () => Date.now();

// Dados do comprador: tira caracteres de controle e limita o tamanho.
export const cleanName = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
export const cleanPhone = (v: unknown) => String(v ?? '').replace(/[^\d+()\-\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);

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
  qr?: string; qrImage?: string;
  name?: string; phone?: string; // quem comprou (cadastro)
};
export type License = {
  plan: string; email: string; order_id: string; expires_at: number | null; revoked: boolean; created_at: number;
  name?: string; phone?: string; // quem comprou
  hint?: string;                  // final da chave (5 caracteres), para o suporte identificar a chave sem guardá-la
  max_devices?: number;           // limite próprio de aparelhos (chaves de administrador); vazio = MAX_DEVICES
};

export const ordersStore = () => getStore({ name: 'orders', consistency: 'strong' });
export const licensesStore = () => getStore({ name: 'licenses', consistency: 'strong' });
export const pendingStore = () => getStore({ name: 'pending', consistency: 'strong' });
export const devicesStore = () => getStore({ name: 'devices', consistency: 'strong' });
export const usageStore = () => getStore({ name: 'usage', consistency: 'strong' });

// Semana de segunda 00:00 a domingo 23:59, horário de Brasília (UTC-3, sem horário de verão).
const BRT_MS = 3 * 3600 * 1000;
export function weekInfo(t = Date.now()) {
  const d = new Date(t - BRT_MS);                       // "relógio de parede" de Brasília
  const dow = (d.getUTCDay() + 6) % 7;                  // 0 = segunda
  const mondayLocal = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * 86400000;
  const start = mondayLocal + BRT_MS;
  return { id: new Date(mondayLocal).toISOString().slice(0, 10), start, resetsAt: start + 7 * 86400000 };
}

// Soma (delta > 0, respeitando o limite) ou devolve (delta < 0) músicas no contador da semana.
// Usa etag para que dois pedidos ao mesmo tempo nunca ultrapassem o limite.
export async function usageChange(h: string, week: string, delta: number, limit: number | null): Promise<{ applied: number; used: number }> {
  const S = usageStore(), k = `${h}/${week}`;
  for (let i = 0; i < 8; i++) {
    const cur = await S.getWithMetadata(k, { type: 'json' });
    const used = Math.max(0, Number((cur?.data as { n?: number } | undefined)?.n) || 0);
    let applied = delta;
    if (delta > 0 && limit != null) applied = Math.min(delta, Math.max(0, limit - used));
    if (delta < 0) applied = -Math.min(-delta, used);
    if (applied === 0) return { applied: 0, used };
    const n = used + applied;
    const w = cur ? await S.setJSON(k, { n }, { onlyIfMatch: cur.etag }) : await S.setJSON(k, { n }, { onlyIfNew: true });
    if (w.modified) return { applied, used: n };
  }
  throw new Error('usage-busy');
}

// Chave válida, não revogada, não vencida e já registrada neste aparelho (a entrada do aparelho é feita em /api/validate).
export async function loadLicense(pepper: string, keyIn: unknown, deviceIn: unknown): Promise<{ h: string; L: License } | null> {
  const key = String(keyIn || '').trim().toUpperCase(), device = String(deviceIn || '');
  if (!/^MS-([A-Z2-9]{5}-){3}[A-Z2-9]{5}$/.test(key) || !/^[a-f0-9]{32}$/.test(device)) return null;
  const h = crypto.createHmac('sha256', pepper).update(key).digest('hex');
  const L = await licensesStore().get(h, { type: 'json' }) as License | null;
  if (!L || L.revoked || (L.expires_at && L.expires_at < Date.now())) return null;
  if ((await devicesStore().get(`${h}/${device}`)) === null) return null;
  return { h, L };
}

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
      name: o.name || '', phone: o.phone || '', hint: key.slice(-5),
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

// ---------- Anti-robô (Cloudflare Turnstile, opcional) ----------
export async function verifyTurnstile(secret: string, token: string, ip?: string): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
  const j: any = await r.json().catch(() => ({}));
  return j.success === true;
}

// Um Pix pendente por e-mail+plano: cliques repetidos devolvem o MESMO Pix e não criam cobranças novas.
export const pendingKey = (plan: string, email: string) => crypto.createHash('sha256').update(plan + '|' + email).digest('hex');
export const PIX_VALID_MS = 25 * 60 * 1000;

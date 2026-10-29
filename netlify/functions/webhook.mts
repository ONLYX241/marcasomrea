import type { Config } from '@netlify/functions';
import { approveOrder, cents, cfg, code, hmacHex, licensesStore, now, ordersStore, pick, PLANS, safeEq, type License, type Order } from '../lib/common.mts';

// 2) webhook da AtenasPay. Assinatura obrigatória: HMAC-SHA256 de "<ts>.<corpo cru>"
export default async (req: Request) => {
  const c = cfg();
  if (!c) return code(500);
  try {
    const raw = await req.text();
    const sig = String(req.headers.get('x-webhook-signature') || '');
    const parts: Record<string, string> = Object.fromEntries(sig.split(',').map(s => { const i = s.indexOf('='); return [s.slice(0, i).trim(), s.slice(i + 1).trim()]; }));
    const ts = parts.t, v1 = parts.v1;
    if (!ts || !v1 || !raw) return code(400);
    if (!safeEq(hmacHex(c.webhookSecret, ts + '.' + raw), v1)) return code(401);
    // anti-replay (aceita ts em segundos ou milissegundos)
    const t = Number(ts), tms = t < 1e12 ? t * 1000 : t;
    if (!Number.isFinite(tms) || Math.abs(now() - tms) > 10 * 60 * 1000) return code(400);

    let b: any = {};
    try { b = JSON.parse(raw); } catch { return code(400); }
    const orderId = String(pick(b, ['external_id', 'externalId', 'reference']) || '');
    const status = String(pick(b, ['status', 'event', 'type']) || '');
    const isPaid = /(^|[._\s-])(paid|approved|completed|confirmed|pago|aprovado|settled)($|[._\s-])/i.test(status) && !/(un|not|nao|não)[._\s-]?paid/i.test(status);
    console.log('webhook ok', { orderId, status, paid: isPaid });

    if (!/^[a-f0-9]{32}$/.test(orderId)) return code(200); // evento que não é nosso
    const S = ordersStore();
    const cur = await S.getWithMetadata(orderId, { type: 'json' });
    if (!cur) return code(200);
    const o = cur.data as Order;

    if (isPaid) {
      // Se a AtenasPay informar o valor pago, ele tem que bater com o preço do plano.
      const amt = pick(b, ['amount', 'paid_amount', 'value']);
      if (amt != null && Number(amt) !== cents(PLANS[o.plan].price) && Math.abs(Number(amt) - PLANS[o.plan].price) > 0.005) {
        console.error('PAGAMENTO SUSPEITO, não liberado', { orderId, amt, esperado: cents(PLANS[o.plan].price) });
        if (o.status === 'pending') await S.setJSON(orderId, { ...o, status: 'flagged' }, { onlyIfMatch: cur.etag });
        return code(200);
      }
      await approveOrder(c.pepper, orderId);
    } else if (/refund|reembols|chargeback|estorn|revers/i.test(status)) {
      if (o.lic) {
        const L = await licensesStore().get(o.lic, { type: 'json' }) as License | null;
        if (L) await licensesStore().setJSON(o.lic, { ...L, revoked: true });
      }
      await S.setJSON(orderId, { ...o, status: 'refunded', key_plain: null });
    } else if (/expir|cancel|fail|reject/i.test(status)) {
      if (o.status === 'pending') await S.setJSON(orderId, { ...o, status: 'expired' }, { onlyIfMatch: cur.etag });
    }
    return code(200);
  } catch (e: any) {
    console.error('webhook', e.message);
    return code(500); // a AtenasPay tenta de novo
  }
};

export const config: Config = { path: '/api/webhook', method: 'POST', rateLimit: { action: 'rate_limit', windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] } };

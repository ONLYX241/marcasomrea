import type { Config, Context } from '@netlify/functions';
import QRCode from 'qrcode';
import { atenasCreate, badConfig, cents, cfg, cleanName, cleanPhone, emvAmount, json, newOrderId, now, ordersStore, pendingKey, pendingStore, pick, PIX_VALID_MS, PLANS, guard, parseBody, verifyTurnstile, type Order } from '../lib/common.mts';

// 1) cria a cobrança Pix com o PREÇO DO SERVIDOR
export default async (req: Request, context?: Context) => {
  const c = cfg();
  if (!c) return badConfig();
  if (c.checkoutPaused) return json({ error: 'Vendas temporariamente pausadas. Tente novamente mais tarde.' }, 503);
  try {
    const g = guard(req, context); if (g) return g;
    const p = await parseBody(req, { plan: ['s', 20, true], email: ['s', 254, true], name: ['s', 80, true], phone: ['s', 40], ts: ['s', 2048], website: ['s', 200] });
    if (!p.ok) return p.res;
    const b = p.d;
    if (b.website) return json({ error: 'Não foi possível concluir. Tente de novo.' }, 400); // isca anti-robô preenchida
    const plan = String(b.plan || '');
    const email = String(b.email || '').trim().toLowerCase();
    const name = cleanName(b.name), phone = cleanPhone(b.phone);
    if (!PLANS[plan]) return json({ error: 'Plano inválido.' }, 400);
    if (name.length < 2) return json({ error: 'Digite seu nome.' }, 400);
    if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) || email.length > 254) return json({ error: 'E-mail inválido.' }, 400);

    // Anti-robô (só se TURNSTILE_SECRET estiver configurado)
    if (c.turnstileSecret && !(await verifyTurnstile(c.turnstileSecret, String(b.ts || ''), context?.ip))) {
      return json({ error: 'Confirme que você não é um robô e tente de novo.' }, 400);
    }

    const P = PLANS[plan];
    const pk = pendingKey(plan, email, c.pepper);

    // Já existe um Pix pendente e válido para esse e-mail+plano? Devolve o mesmo.
    const pend = await pendingStore().get(pk, { type: 'json' }) as { id: string } | null;
    if (pend) {
      const old = await ordersStore().get(pend.id, { type: 'json' }) as Order | null;
      if (old && old.status === 'pending' && old.qr && now() - old.created_at < PIX_VALID_MS) {
        const left = Math.max(1, Math.ceil((PIX_VALID_MS - (now() - old.created_at)) / 60000));
        return json({ orderId: old.id, amount: old.amount, plan, qr: old.qr, qrImage: old.qrImage || '', expiresInMin: left });
      }
    }

    const id = newOrderId();
    const pay = await atenasCreate(c, c.amountUnit === 'centavos' ? cents(P.price) : P.price, id);

    const copia = pick(pay, ['pix_copia_cola', 'qr_code', 'pix_code', 'copia_e_cola', 'copy_paste', 'brcode', 'emv', 'payload', 'pix_copia_e_cola', 'qrcode']);
    let img = pick(pay, ['qr_code_base64', 'qrcode_base64', 'qr_code_image', 'qr_image', 'image_base64']);
    if (!copia && !img) {
      console.error('Resposta inesperada da AtenasPay (sem QR):', JSON.stringify(pay).slice(0, 500));
      throw new Error('Resposta sem QR Code.');
    }
    // Trava de segurança 1: o valor que a AtenasPay confirmou tem que ser o preço do plano.
    const confirmado = pick(pay, ['amount']);
    if (confirmado != null && Math.abs(Number(confirmado) - P.price) > 0.005 && Number(confirmado) !== cents(P.price)) {
      console.error('VALOR DIVERGENTE: plano', plan, 'esperado', P.price, 'AtenasPay confirmou', confirmado, '(confira AMOUNT_UNIT)');
      throw new Error('Valor do Pix diferente do plano.');
    }
    // Trava de segurança 2: o valor dentro do Pix tem que ser o preço do plano.
    const emv = copia ? emvAmount(String(copia)) : null;
    if (emv !== null && Math.abs(emv - P.price) > 0.005) {
      console.error('VALOR DO PIX DIVERGENTE: plano', plan, 'esperado', P.price, 'veio', emv, '(confira AMOUNT_UNIT)');
      throw new Error('Valor do Pix diferente do plano.');
    }
    if (img && !String(img).startsWith('data:')) img = 'data:image/png;base64,' + img;
    if (!img) img = await QRCode.toDataURL(String(copia), { margin: 1, width: 440 }); // QR a partir do copia e cola

    const order: Order = { id, plan, email, amount: P.price, status: 'pending', key_plain: null, key_until: null, lic: null, created_at: now(), qr: copia ? String(copia) : '', qrImage: String(img), name, phone };
    await ordersStore().setJSON(id, order);
    await pendingStore().setJSON(pk, { id });
    return json({ orderId: id, amount: P.price, plan, qr: order.qr, qrImage: order.qrImage, expiresInMin: 30 });
  } catch (e: any) {
    console.error('checkout', e.message, e.detail ? JSON.stringify(e.detail) : '');
    return json({ error: 'Não consegui gerar o Pix agora. Tente novamente.' }, 502);
  }
};

export const config: Config = {
  path: '/api/checkout',
  method: 'POST',
  rateLimit: { action: 'rate_limit', windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

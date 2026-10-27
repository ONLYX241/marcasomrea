import type { Config } from '@netlify/functions';
import QRCode from 'qrcode';
import { atenasCreate, badConfig, cents, cfg, emvAmount, json, newOrderId, now, ordersStore, pick, PLANS, readJson, type Order } from '../lib/common.mts';

// 1) cria a cobrança Pix com o PREÇO DO SERVIDOR
export default async (req: Request) => {
  const c = cfg();
  if (!c) return badConfig();
  try {
    const b = await readJson(req);
    const plan = String(b.plan || '');
    const email = String(b.email || '').trim().toLowerCase();
    if (!PLANS[plan]) return json({ error: 'Plano inválido.' }, 400);
    if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) || email.length > 254) return json({ error: 'E-mail inválido.' }, 400);

    const id = newOrderId();
    const P = PLANS[plan];
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

    const order: Order = { id, plan, email, amount: P.price, status: 'pending', key_plain: null, key_until: null, lic: null, created_at: now() };
    await ordersStore().setJSON(id, order);
    return json({ orderId: id, amount: P.price, plan, qr: copia || '', qrImage: img, expiresInMin: 30 });
  } catch (e: any) {
    console.error('checkout', e.message, e.detail ? JSON.stringify(e.detail) : '');
    return json({ error: 'Não consegui gerar o Pix agora. Tente novamente.' }, 502);
  }
};

export const config: Config = {
  path: '/api/checkout',
  method: 'POST',
  rateLimit: { action: 'rate_limit', windowLimit: 8, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

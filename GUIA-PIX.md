# MarcaSom – Pix na Netlify (passo a passo)

Tudo roda na Netlify, no mesmo endereço: o site e as funções `/api/...`.
O cliente paga o Pix, a AtenasPay avisa o webhook, o servidor gera a chave e o site libera sozinho.
As licenças ficam guardadas no Netlify Blobs (já incluso, não precisa configurar nada).

## 1. Subir o projeto no GitHub
1. Crie um repositório **privado** no github.com.
2. Envie todos os arquivos desta pasta **menos o `.env`** (o `.gitignore` já impede). Tem que ir a pasta `netlify/`, a pasta `site/`, `package.json` e `netlify.toml`.

## 2. Criar o site na Netlify
1. app.netlify.com > **Add new site > Import an existing project** > escolha o repositório.
2. Deixe as configurações como estão (o `netlify.toml` já diz que a pasta publicada é `site`). Clique em **Deploy**.
   > Atenção: arrastar a pasta em "Netlify Drop" **não** publica as funções. Use o Git (ou o Netlify CLI).

## 3. Variáveis de ambiente
Em **Site configuration > Environment variables > Add a variable**, crie estas 4 (copie do seu `.env`).
Em "Scopes" deixe **Functions** marcado:

| Variável | O que é |
|---|---|
| `ATENAS_API_KEY` | chave da AtenasPay (`atenaspay_live_...`) |
| `ATENAS_WEBHOOK_SECRET` | segredo do webhook (`nxps_...`) |
| `LICENSE_PEPPER` | texto aleatório grande (mín. 32 caracteres) |
| `ADMIN_TOKEN` | outro texto aleatório grande (mín. 32 caracteres) |

Depois de salvar, vá em **Deploys > Trigger deploy > Deploy site** (as variáveis só valem no deploy seguinte).

## 4. Testar
Abra `https://SEU-SITE.netlify.app/health`. Deve aparecer `{"ok":true,"configured":true}`.
Se vier `"configured":false`, falta alguma variável do passo 3.

## 5. Webhook na AtenasPay
No painel da AtenasPay cadastre: `https://SEU-SITE.netlify.app/api/webhook`
(o segredo é o mesmo do `ATENAS_WEBHOOK_SECRET`).

## 6. Compra de teste
Faça um Pix do plano mais barato com você mesmo. A tela deve mostrar o pagamento confirmado e a chave `MS-XXXXX-...`.
Nos logs (Netlify > Logs > Functions) aparece a linha `webhook ok` com o status recebido. Se pagou e não liberou, o status da AtenasPay pode ter outro nome; me mande essa linha.

## Valores e prazos
Ficam em `netlify/lib/common.mts` (`PLANS`). O preço mostrado no site (`PRICES` no `index.html`) precisa ser igual.
O servidor sempre cobra o preço dele, nunca o que o navegador manda.

## Administração
Use o `ADMIN_TOKEN` no header `Authorization: Bearer SEU_TOKEN`:
- `GET  /api/admin/orders` – últimos pedidos
- `POST /api/admin/revoke` `{"email":"cliente@x.com"}` – revoga as chaves (reembolso)
- `POST /api/admin/reset-devices` `{"email":"cliente@x.com"}` – zera os aparelhos

## Segurança
- Chave da AtenasPay e segredos ficam só nas variáveis da Netlify, nunca no site.
- Webhook só vale com assinatura HMAC correta e carimbo de tempo recente.
- Webhook repetido não gera 2ª chave; valor pago diferente do plano não libera.
- A chave em texto puro some do servidor 24h depois da compra.

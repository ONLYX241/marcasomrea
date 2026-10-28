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

## Painel de clientes (quem comprou)
Abra `https://SEU-SITE.netlify.app/admin` e entre com o `ADMIN_TOKEN` (fica só na sessão do navegador; "Sair" apaga).
- **Clientes:** uma linha por e-mail, com nome, e-mail, WhatsApp (link direto para conversar), cada compra (plano, data, vencimento, situação Ativa/Expirada/Revogada), quantos aparelhos estão usando a chave (ex.: 1 de 2) e o **final da chave** (5 caracteres) para o suporte identificar a chave sem ver a chave inteira.
- **Pedidos:** todos os Pix gerados, inclusive os não pagos, expirados e suspeitos.
- Botões **Zerar aparelhos** e **Revogar chaves** (reembolso) e **Exportar CSV** (abre no Excel).
- O nome e o WhatsApp vêm do formulário de compra (nome obrigatório, WhatsApp opcional). Compras feitas antes desta versão aparecem como "sem nome".

## Limite semanal de músicas
- **Mensal: 100 músicas por semana. Trimestral: 70 por semana. Vitalício e administrador: sem limite semanal.**
- A semana vai de **segunda 00:00 a domingo 23:59, horário de Brasília**. Na segunda o contador volta a zero.
- O contador fica no **servidor**. Antes de processar, o site reserva as músicas; se o cliente cancelar ou der erro, as que não foram processadas voltam para o limite. Se faltarem menos músicas do que as escolhidas, o site processa só as primeiras que couberem e avisa. Com o limite esgotado, mostra quando renova.
- No `/admin`, cada compra mostra "Esta semana: X de Y músicas". O botão **Zerar limite da semana** devolve tudo ao cliente (use se ele perdeu músicas por queda de internet no meio do processamento).
- Para mudar os números: edite `weekly` em `PLANS` no arquivo `netlify/lib/common.mts` (é o que vale de verdade) e `WEEKLY` perto do topo do script em `site/index.html` (é só o texto dos cartões de plano).
- Vale também para quem já assinou antes desta atualização.

## Acesso de administrador (testar e usar sem pagar)
No `/admin`, no quadro **Liberar acesso sem pagamento**: preencha nome e e-mail, deixe o plano em **Administrador** e clique em **Gerar chave**. A chave aparece uma vez (copie na hora). No site, clique em **"Já tenho uma chave"** e cole. Ela não vence, vale em até 20 aparelhos e libera o download completo. Cada administrador gera a sua. Para revogar, use "Revogar chaves" no cliente. O mesmo quadro serve para vendas feitas por fora do site (escolha Mensal, Trimestral ou Vitalício).

## Volume da vinheta
O cliente escolhe o volume da vinheta de 0% a 200% (slider ou número). A música **não abaixa** em nenhum momento: a vinheta é somada por cima. Só se a soma passar do máximo digital é que o pico é suavizado, sem baixar o resto da música. "Normalizar volume das músicas" é outra opção, que muda o volume das faixas; deixe desligada para manter o original.

## Posição manual da vinheta (para o cliente)
Em "Posição da vinheta" existe a opção **Manual (você escolhe)**. O cliente escolhe a música, clica na onda para marcar onde a vinheta entra (no máximo 2 pontos por música), arrasta para ajustar ou digita o tempo (ex.: `1:05`), ouve com "Ouvir com a vinheta" e pode copiar os pontos para todas as músicas. Música sem ponto marcado usa o modo automático. Tudo roda no navegador do cliente.

## Administração (API)
Use o `ADMIN_TOKEN` no header `Authorization: Bearer SEU_TOKEN`:
- `GET  /api/admin/customers` – clientes agrupados por e-mail (é o que alimenta o painel)
- `GET  /api/admin/orders` – últimos pedidos
- `POST /api/admin/revoke` `{"email":"cliente@x.com"}` – revoga as chaves (reembolso)
- `POST /api/admin/reset-devices` `{"email":"cliente@x.com"}` – zera os aparelhos

## Segurança
- Chave da AtenasPay e segredos ficam só nas variáveis da Netlify, nunca no site.
- Webhook só vale com assinatura HMAC correta e carimbo de tempo recente.
- Webhook repetido não gera 2ª chave; valor pago diferente do plano não libera.
- A chave em texto puro some do servidor 24h depois da compra.

## Valor do Pix e limite da conta
- O servidor manda o valor em **reais** (ex.: 29.90). Se a AtenasPay um dia exigir centavos, crie a variável `AMOUNT_UNIT` = `centavos` na Netlify.
- Trava de segurança: o servidor lê o valor que vem dentro do código Pix e **recusa** se for diferente do preço do plano.
- A conta AtenasPay tem **limite por Pix** (hoje R$ 100,00, podendo subir até R$ 1.000). O plano Vitalício (R$ 129,90) só funciona depois de aumentarem o limite.

## Proteção contra abuso e ataques
O que já está ligado, sem configurar nada:
- **Limite de requisições por IP** (a Netlify bloqueia o excesso): criar Pix 6/min, consultar pedido 60/min, validar chave 30/min, admin 20/min.
- **Um Pix por e-mail+plano:** clicar várias vezes devolve o mesmo Pix, em vez de criar cobranças novas na AtenasPay.
- **Cabeçalhos de segurança + CSP** (`netlify.toml`): o navegador só carrega scripts, estilos e fontes dos endereços liberados, e ninguém consegue colocar o site dentro de outro (clickjacking). HTTPS forçado (HSTS).
- **Valor sempre conferido:** o servidor cobra o preço dele, confere o valor que a AtenasPay confirmou e recusa Pix com valor diferente.
- **Webhook protegido:** assinatura HMAC obrigatória, janela de 10 minutos contra reenvio, e webhook repetido não gera 2ª chave.
- **Chaves de licença** guardadas só como hash. A chave em texto some em 24h.
- A **Netlify** já filtra ataques volumétricos (DDoS de rede) na borda dela.

Opcionais (você liga quando quiser):
1. **Freio de emergência:** se estiver sob ataque, crie a variável `CHECKOUT_PAUSED` = `1` na Netlify e faça um novo deploy. A criação de Pix pausa na hora; o resto do site continua. Apague a variável para voltar.
2. **Anti-robô (Cloudflare Turnstile, grátis):**
   - Em dash.cloudflare.com > **Turnstile** > **Add widget**, informe o endereço do site e copie a **Site key** e a **Secret key**.
   - Na Netlify, crie `TURNSTILE_SECRET` = a Secret key e faça um novo deploy.
   - No `site/index.html`, em `CONFIG`, cole a Site key em `turnstile:'...'`.
   - O quadradinho "Confirme que você não é um robô" passa a aparecer antes do botão Gerar Pix.
3. **Cloudflare na frente do site** (só se você tiver domínio próprio): reforça a proteção contra DDoS e permite regras de firewall.

Importante: os limites protegem seus custos (cada chamada de função gasta créditos da Netlify). Se vir muitas linhas de `ERROR checkout` nos logs, ligue o Turnstile.

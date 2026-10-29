# Segurança do MarcaSom

Este projeto não usa banco SQL, senhas de usuário, cookies de cliente nem upload para servidor (as músicas são processadas no navegador). Por isso alguns itens abaixo mostram o equivalente real no seu caso.

## Os 20 itens

| # | Item | Situação |
|---|------|----------|
| 1 | Esconder API keys | As chaves só existem nas variáveis da Netlify. O `/health` não mostra mais nada da chave. Detalhes ficam em `/api/admin/diag`, só com login. |
| 2 | Limpar segredos do git | `.gitignore` reforçado, hook de commit, `scripts/varrer-segredos.sh`, `scripts/limpar-historico.sh` e gitleaks no GitHub Actions. Veja "Faça você" abaixo. |
| 3 | Banco de chaves privado | As chaves ficam no Netlify Blobs, que só as funções acessam. Guardamos apenas o HMAC da chave, nunca a chave. Nada disso é servido pela pasta `site`. |
| 4 | RLS | Não se aplica (não há Postgres/Supabase). O equivalente: nenhum acesso direto ao armazenamento, tudo passa por função que confere licença ou login. |
| 5 | Criptografia de dados | Nome, e-mail, WhatsApp, chave em texto puro e Pix ficam cifrados com AES-256-GCM. Registros antigos são cifrados ao rodar `POST /api/admin/encrypt-existing`. |
| 6 | Auth no servidor | Licença, limites e admin são conferidos só no servidor. O admin entra por login que gera sessão assinada. |
| 7 | Restringir acessos | Só aceita requisições da própria origem, métodos fixos por rota, `ADMIN_IPS` opcional para limitar o admin por IP. |
| 8 | Mass assignment | Cada rota tem um esquema fechado: campo que não está na lista derruba o pedido com 400. |
| 9 | Cookies | Sessão do admin em cookie `__Host-` com HttpOnly, Secure, SameSite=Strict, 1 hora. O token deixou de ficar no navegador. |
| 10 | Hash de senhas | Não há senhas de usuário. As chaves de licença usam HMAC-SHA256 com segredo (pepper) e a comparação é em tempo constante. |
| 11 | Rate limit | Por IP em todas as rotas (incluindo webhook e health) e bloqueio de 15 minutos após 5 erros de login no admin. |
| 12 | Proteção contra bots | Isca escondida no formulário de compra, checagem de origem e Turnstile (ative com `TURNSTILE_SECRET`). |
| 13 | Queries parametrizadas | Não há SQL. As chaves do armazenamento só recebem valores validados por regex (hex e formato da licença). |
| 14 | Validação de entrada | Tipo, tamanho e formato de cada campo; corpo máximo de 8 KB; JSON obrigatório. |
| 15 | Vazamento de conteúdo | Erros genéricos, `/health` mínimo, bloqueio de `/.git`, `/.env` e `*.map`, `noindex` e `no-store` nas respostas da API. |
| 16 | Arquivos suspeitos em uploads | No navegador: confere a assinatura real do arquivo (MP3, WAV, FLAC, OGG, M4A), limite de 200 MB e 2000 arquivos, nomes limpos no ZIP. |
| 17 | Respostas enxutas | Cada rota devolve só o que a tela usa. |
| 18 | Cabeçalhos de segurança | CSP estrita sem script inline, HSTS, COOP, CORP, X-Frame-Options, Permissions-Policy. |
| 19 | Forçar HTTPS | HSTS de 2 anos e `upgrade-insecure-requests`. Confirme em Netlify, Domain management, HTTPS, "Force HTTPS". |
| 20 | Scan de dependências | `package-lock.json`, `npm audit` (hoje: 0 vulnerabilidades), Dependabot semanal e job no GitHub Actions. JSZip e lamejs agora são hospedados por você e atualizados pelo mesmo scan. |

## Faça você (não dá para fazer de fora)

1. **Trocar as chaves.** Se algum dia `ATENAS_API_KEY`, `ATENAS_WEBHOOK_SECRET`, `ADMIN_TOKEN` ou `LICENSE_PEPPER` estiveram no git, gere novas. Limpar o histórico não desfaz o vazamento. Trocar `LICENSE_PEPPER` invalida as chaves já vendidas, então só faça se houve vazamento real.
2. **Criar `DATA_KEY`** nas variáveis da Netlify (96 caracteres aleatórios, diferente das outras) e depois chamar `POST /api/admin/encrypt-existing` uma vez. Não troque depois.
3. **Limpar o histórico** (se achar algo): `sh scripts/varrer-segredos.sh`, depois `sh scripts/limpar-historico.sh .env`.
4. **Ativar a proteção de commit:** `sh scripts/instalar-hooks.sh`.
5. **Ligar o Turnstile** (opcional): crie o widget no Cloudflare e coloque `TURNSTILE_SECRET` na Netlify.
6. **`ADMIN_IPS`** (opcional): se você sempre acessa de IP fixo, liste aqui.

## Limite que continua existindo

O processamento de áudio acontece no navegador, então o bloqueio de download do teste grátis é feito na tela e um usuário técnico consegue contornar. O que é cobrado (licença, aparelhos, limite semanal) é conferido no servidor. Fechar esse buraco por completo exigiria processar o áudio no servidor.

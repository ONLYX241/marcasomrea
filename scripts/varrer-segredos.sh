#!/bin/sh
# Procura segredos no projeto e em TODO o histórico do git. Sai com erro se achar algo.
PAT='(atenaspay_live_[A-Za-z0-9]{8,}|nxps_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(ADMIN_TOKEN|LICENSE_PEPPER|DATA_KEY|ATENAS_API_KEY|ATENAS_WEBHOOK_SECRET|TURNSTILE_SECRET)[[:space:]]*=[[:space:]]*[A-Za-z0-9_./+-]{24,})'
fail=0
echo "Arquivos atuais:"; git ls-files -z 2>/dev/null | xargs -0 grep -InE "$PAT" 2>/dev/null | grep -v 'env.example' && fail=1
echo "Histórico do git:"; git log -p --all 2>/dev/null | grep -nE "^\+.*($PAT)" | grep -v 'env.example' | head -20 && fail=1
git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v 'env.example' && { echo "Há arquivo .env versionado!"; fail=1; }
[ $fail -eq 0 ] && echo "Nada encontrado." || echo "ATENÇÃO: segredo encontrado. Siga o passo a passo em SEGURANCA.md (trocar as chaves e limpar o histórico)."
exit $fail

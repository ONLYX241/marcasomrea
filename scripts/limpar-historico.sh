#!/bin/sh
# Remove um arquivo (ex.: .env) de TODO o histórico do git. Reescreve o histórico: faça backup antes.
# Uso: sh scripts/limpar-historico.sh .env
# Requer: pip install git-filter-repo
[ -z "$1" ] && { echo "Uso: sh scripts/limpar-historico.sh <arquivo>"; exit 1; }
git filter-repo --invert-paths --path "$1" --force || exit 1
echo "Pronto. Agora: git remote add origin <url> && git push --force --all && git push --force --tags"
echo "IMPORTANTE: troque TODAS as chaves que já estiveram no histórico. Limpar o git não desfaz o vazamento."

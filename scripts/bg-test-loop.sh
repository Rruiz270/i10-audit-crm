#!/bin/bash
# Background test loop — roda o test suite a cada 2 minutos e grava resultados.
# Usado durante a fase pré-deploy para detectar regressões em vista de mudanças.
cd "$(dirname "$0")/.."
while true; do
  ts=$(date +%Y-%m-%d_%H%M%S)
  out=".test-runs/run_${ts}.log"
  node scripts/test-usecases.mjs > "$out" 2>&1
  result=$(tail -3 "$out" | grep "Total:" | head -1)
  echo "[$(date +%H:%M:%S)] $result → ${out}"
  sleep 120
done

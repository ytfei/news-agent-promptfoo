#!/usr/bin/env bash
set -euo pipefail

# 显式列出全部 suite。不要从 registry.yaml 推导：只有 1 条登记时，
# smoke / judge-anchors / redteam 会被漏跑（AGENTS.md §8.3）。
SUITES=(
  "writer:evals/suites/writer.yaml"
  "smoke:evals/suites/smoke.yaml"
  "judge-anchors:evals/suites/judge-anchors.yaml"
  "redteam:evals/suites/redteam.yaml"
)

mkdir -p reports
FAILED=0

for entry in "${SUITES[@]}"; do
  name="${entry%%:*}"
  cfg="${entry##*:}"
  echo "▶ running suite: ${name}"
  if ! npx promptfoo eval -c "$cfg" -o "reports/${name}.json" --no-progress-bar; then
    FAILED=1
    echo "✗ suite failed: ${name}"
  fi
done

# 汇总只读、不改原始报告；失败与否由各 suite 的退出码决定
node scripts/summary.mjs reports/*.json || true
exit "$FAILED"

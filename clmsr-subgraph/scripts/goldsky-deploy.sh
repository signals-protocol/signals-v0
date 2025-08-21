#!/usr/bin/env bash
set -euo pipefail

NET="${1:-citrea}"          # citrea
STAGE="${2:-dev}"           # dev | prod  
NEW="${3:?Usage: $0 <net> <stage> <newVersion> [prevVersion]}"  # 예: 1.0.1
PREV="${4:-}"               # 옵션: 이전 버전에서 graft

# 서브그래프 이름/매니페스트 경로 규칙
SUBGRAPH="signals-v0-${NET}-${STAGE}"
YAML="subgraph-${NET}-${STAGE}.yaml"

# clmsr-subgraph 루트로 이동
pushd "$(dirname "$0")/.." >/dev/null

# 배포용 매니페스트 임시 적용
cp "$YAML" subgraph.yaml

# 빌드 실행
echo "🔨 Building subgraph..."
graph build

# (옵션) 이전 버전에서 그라프트
GRAFT_FLAG=()
if [[ -n "${PREV}" ]]; then
  GRAFT_FLAG=(--graft-from "${SUBGRAPH}/${PREV}")
  echo "📈 Grafting from ${SUBGRAPH}/${PREV}"
fi

echo "🚀 Deploying ${SUBGRAPH}/${NEW}..."
if [[ ${#GRAFT_FLAG[@]} -gt 0 ]]; then
  goldsky subgraph deploy "${SUBGRAPH}/${NEW}" --path . "${GRAFT_FLAG[@]}"
else
  goldsky subgraph deploy "${SUBGRAPH}/${NEW}" --path .
fi

rm -f subgraph.yaml
popd >/dev/null

echo "✅ Successfully deployed ${SUBGRAPH}/${NEW}"
echo "📊 Check status: yarn status:${NET}:${STAGE}"
echo "🏷️ Tag when ready: yarn tag:${NET}:${STAGE} ${NEW} latest"

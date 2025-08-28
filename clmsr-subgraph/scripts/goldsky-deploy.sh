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

# 1) 클린 빌드 - stale 산출물 완전 제거
echo "🧹 Cleaning build artifacts..."
rm -rf build generated subgraph.yaml

# 2) 환경별 매니페스트 복사
echo "📋 Setting up manifest for ${NET}-${STAGE}..."
cp "$YAML" subgraph.yaml

# 3) 완전 빌드 (코드젠 포함)
echo "🔨 Building subgraph (codegen + build)..."
graph codegen && graph build

# 빌드 산출물 검증 (스키마/매핑 일치 보장)
echo "🔍 Verifying build artifacts..."
for t in "type Market @entity" "type MarketDistribution @entity" "type BinState @entity"; do
  grep -q "$t" build/schema.graphql || { echo "❌ Missing: $t"; exit 1; }
done
echo "✅ Core entities verified in build/schema.graphql"

# entities 매니페스트 검증 (BSD grep 호환)
echo "🔍 Verifying entities in manifest..."
if grep -- "- Market" build/subgraph.yaml >/dev/null 2>&1 && \
   grep -- "- MarketDistribution" build/subgraph.yaml >/dev/null 2>&1 && \
   grep -- "- BinState" build/subgraph.yaml >/dev/null 2>&1; then
  echo "✅ 핵심 entities 확인 완료"

# Market 필드 레벨 정합성 체크 (상세 로그)
echo "🔍 Verifying Market schema fields..."
must_have_fields=(
  'id: String!'
  'marketId: BigInt!'
  'minTick: BigInt!'
  'maxTick: BigInt!'
  'tickSpacing: BigInt!'
  'startTimestamp: BigInt!'
  'endTimestamp: BigInt!'
  'numBins: BigInt!'
  'liquidityParameter: BigInt!'
  'isSettled: Boolean!'
  'settlementValue: BigInt'
  'settlementTick: BigInt'
  'lastUpdated: BigInt!'
)

echo "📋 Checking Market fields in build/schema.graphql:"
for f in "${must_have_fields[@]}"; do
  if grep -- "$f" build/schema.graphql >/dev/null 2>&1; then
    echo "  ✅ Found: $f"
  else
    echo "  ❌ Missing: $f"
    echo "📄 Current Market definition in schema:"
    grep -A 20 "type Market @entity" build/schema.graphql | head -20
    exit 1
  fi
done
echo "✅ All Market schema fields verified"
else
  echo "❌ 핵심 entities 누락"
  exit 1
fi

# (옵션) 이전 버전에서 그라프트
GRAFT_FLAG=()
if [[ -n "${PREV}" ]]; then
  GRAFT_FLAG=(--graft-from "${SUBGRAPH}/${PREV}")
  echo "📈 Grafting from ${SUBGRAPH}/${PREV}"
fi

echo "🚀 Deploying ${SUBGRAPH}/${NEW} from build artifacts..."
if [[ ${#GRAFT_FLAG[@]} -gt 0 ]]; then
  goldsky subgraph deploy "${SUBGRAPH}/${NEW}" --path ./build "${GRAFT_FLAG[@]}"
else
  goldsky subgraph deploy "${SUBGRAPH}/${NEW}" --path ./build
fi

rm -f subgraph.yaml
popd >/dev/null

echo "✅ Successfully deployed ${SUBGRAPH}/${NEW}"
echo "📊 Check status: yarn status:${NET}:${STAGE}"
echo "🏷️ Tag when ready: yarn tag:${NET}:${STAGE} ${NEW} latest"

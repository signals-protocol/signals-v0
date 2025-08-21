#!/usr/bin/env bash
set -euo pipefail

NET="${1:-citrea}"          # citrea
STAGE="${2:-dev}"           # dev | prod

# 서브그래프 이름 규칙
SUBGRAPH="signals-v0-${NET}-${STAGE}"

echo "📊 Subgraph Status: ${SUBGRAPH}"
echo "=================================="

# 현재 배포된 모든 버전과 태그 조회
goldsky subgraph list | grep "${SUBGRAPH}" || echo "No deployments found"

echo ""
echo "🔍 Current Tag Status:"
echo "======================"
goldsky subgraph list | grep "${SUBGRAPH}" | grep "latest\|prod\|staging" || echo "No tags found"

echo ""
echo "📈 Usage Instructions:"
echo "======================"
echo "Latest API: https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/${SUBGRAPH}/latest/gn"
echo "Specific:   https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/${SUBGRAPH}/[VERSION]/gn"

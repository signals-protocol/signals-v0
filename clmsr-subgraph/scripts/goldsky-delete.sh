#!/usr/bin/env bash
set -euo pipefail

NET="${1:-citrea}"          # citrea
STAGE="${2:-dev}"           # dev | prod  
VERSION="${3:?Usage: $0 <net> <stage> <version>}"  # 예: 1.0.0

# 서브그래프 이름 규칙
SUBGRAPH="signals-v0-${NET}-${STAGE}"

echo "🗑️ Deleting ${SUBGRAPH}/${VERSION}"

# 연결된 태그들 먼저 확인
echo "🔍 Checking for attached tags..."
goldsky subgraph list | grep "${SUBGRAPH}/${VERSION}" || {
  echo "❌ Version ${VERSION} not found"
  exit 1
}

# 태그 제거 확인
read -p "⚠️  Remove all tags from this version first? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🏷️ Removing all tags from ${SUBGRAPH}/${VERSION}..."
  for tag in "latest" "prod" "staging"; do
    goldsky subgraph tag delete "${SUBGRAPH}/${VERSION}" --tag "${tag}" --force 2>/dev/null || true
  done
fi

# 삭제 확인
read -p "🚨 Are you sure you want to delete ${SUBGRAPH}/${VERSION}? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  goldsky subgraph delete "${SUBGRAPH}/${VERSION}" --force
  echo "✅ Successfully deleted ${SUBGRAPH}/${VERSION}"
else
  echo "❌ Deletion cancelled"
  exit 1
fi

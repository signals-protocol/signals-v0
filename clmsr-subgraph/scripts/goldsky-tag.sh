#!/usr/bin/env bash
set -euo pipefail

NET="${1:-citrea}"          # citrea
STAGE="${2:-dev}"           # dev | prod
VERSION="${3:?Usage: $0 <net> <stage> <version> <tag>}"  # 예: 1.0.1
TAG="${4:?Usage: $0 <net> <stage> <version> <tag>}"      # latest | prod | staging

# 서브그래프 이름 규칙
SUBGRAPH="signals-v0-${NET}-${STAGE}"

echo "🏷️ Tagging ${SUBGRAPH}/${VERSION} as '${TAG}'"

# 기존 태그 삭제 (다른 버전에서)
echo "🧹 Removing existing '${TAG}' tag..."
goldsky subgraph list | grep "${SUBGRAPH}/" | grep "${TAG}" | while read -r line; do
  if [[ "$line" =~ \*[[:space:]]+([^/]+/[^[:space:]]+)[[:space:]]+\-\>[[:space:]]+([^/]+/[^[:space:]]+) ]]; then
    old_version="${BASH_REMATCH[1]}"
    if [[ "${old_version}" != "${SUBGRAPH}/${VERSION}" ]]; then
      echo "🗑️ Removing '${TAG}' tag from ${old_version}"
      goldsky subgraph tag delete "${old_version}" --tag "${TAG}" --force 2>/dev/null || true
    fi
  fi
done

# 새 태그 생성
goldsky subgraph tag create "${SUBGRAPH}/${VERSION}" --tag "${TAG}"

echo "✅ Successfully tagged ${SUBGRAPH}/${VERSION} as '${TAG}'"
echo "🌐 API URL: https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/${SUBGRAPH}/${TAG}/gn"

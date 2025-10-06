#!/usr/bin/env bash
set -euo pipefail

NETWORK="${1:?Usage: $0 <network> [env-file]}"
ENV_FILE="${2:-deployments/environments/${NETWORK}.json}"

echo "🔍 Auto-verifying all contracts from ${ENV_FILE}"

# Check if env file exists
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Environment file not found: $ENV_FILE"
  exit 1
fi

# Extract addresses using node
FIXED_POINT_MATH=$(node -e "console.log(require('./$ENV_FILE').contracts.libraries.FixedPointMathU || '')")
LAZY_MUL_SEGMENT_TREE=$(node -e "console.log(require('./$ENV_FILE').contracts.libraries.LazyMulSegmentTree || '')")
MANAGER=$(node -e "console.log(require('./$ENV_FILE').contracts.core.CLMSRMarketManager || '')")
POSITION_IMPL=$(node -e "console.log(require('./$ENV_FILE').contracts.core.CLMSRPositionImplementation || '')")
CORE_IMPL=$(node -e "console.log(require('./$ENV_FILE').contracts.core.CLMSRMarketCoreImplementation || '')")
POINTS_IMPL=$(node -e "console.log(require('./$ENV_FILE').contracts.points.PointsGranterImplementation || '')")

echo "📚 Libraries to verify:"
echo "  FixedPointMathU: $FIXED_POINT_MATH"
echo "  LazyMulSegmentTree: $LAZY_MUL_SEGMENT_TREE"
echo ""
echo "🏢 Manager to verify:"
echo "  CLMSRMarketManager: $MANAGER"
echo ""
echo "🏗️ Implementations to verify:"
echo "  Position: $POSITION_IMPL"
echo "  Core: $CORE_IMPL"
echo "  Points: $POINTS_IMPL"
echo ""

# Create temporary libraries.js
TEMP_LIBS="libraries_temp_$$.js"
cat > "$TEMP_LIBS" << EOF
module.exports = {
  FixedPointMathU: "$FIXED_POINT_MATH",
  LazyMulSegmentTree: "$LAZY_MUL_SEGMENT_TREE",
};
EOF

# Create manager-specific libraries.js (only LazyMulSegmentTree)
TEMP_LIBS_MANAGER="libraries_manager_temp_$$.js"
cat > "$TEMP_LIBS_MANAGER" << EOF
module.exports = {
  LazyMulSegmentTree: "$LAZY_MUL_SEGMENT_TREE",
};
EOF

echo "📝 Created temporary libraries files"

# Function to verify contract
verify_contract() {
  local name="$1"
  local address="$2"
  local contract_path="$3"
  local libraries_flag="$4"
  local libs_file="${5:-$TEMP_LIBS}"
  
  if [[ -z "$address" || "$address" == "null" ]]; then
    echo "⏭️ Skipping $name (address not found)"
    return
  fi
  
  echo "🔍 Verifying $name: $address"
  
  if [[ -n "$libraries_flag" ]]; then
    npx hardhat verify --network "$NETWORK" --libraries "$libs_file" "$address" || {
      echo "⚠️ Failed to verify $name, continuing..."
    }
  else
    npx hardhat verify --network "$NETWORK" "$address" || {
      echo "⚠️ Failed to verify $name, continuing..."
    }
  fi
  
  echo ""
}

# Verify libraries first
echo "📚 Verifying libraries..."
verify_contract "FixedPointMathU" "$FIXED_POINT_MATH" "contracts/libraries/FixedPointMath.sol:FixedPointMathU" ""
verify_contract "LazyMulSegmentTree" "$LAZY_MUL_SEGMENT_TREE" "contracts/libraries/LazyMulSegmentTree.sol:LazyMulSegmentTree" ""

# Verify manager
echo "🏢 Verifying manager..."
verify_contract "CLMSRMarketManager" "$MANAGER" "" "yes" "$TEMP_LIBS_MANAGER"

# Verify implementations
echo "🏗️ Verifying implementations..."
verify_contract "CLMSRPosition" "$POSITION_IMPL" "" ""
verify_contract "CLMSRMarketCore" "$CORE_IMPL" "" "yes"
verify_contract "PointsGranter" "$POINTS_IMPL" "" ""

# Cleanup
rm -f "$TEMP_LIBS" "$TEMP_LIBS_MANAGER"
echo "🧹 Cleaned up temporary libraries files"

echo "✅ Verification process completed!"

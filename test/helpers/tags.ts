// Test layer tags for filtering
export const UNIT_TAG = "@unit";
export const COMPONENT_TAG = "@component";
export const INTEGRATION_TAG = "@integration";
export const INVARIANT_TAG = "@invariant";
export const E2E_TAG = "@e2e";
export const PERF_TAG = "@perf";
export const SECURITY_TAG = "@security";
export const REPLAY_TAG = "@replay";

// Test descriptions with tags
export const withTag = (tag: string, description: string) =>
  `${tag} ${description}`;

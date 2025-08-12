import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

export async function statusAction(environment: Environment): Promise<void> {
  console.log(`📊 Status for ${environment}`);
  envManager.printEnvironmentStatus(environment);
}

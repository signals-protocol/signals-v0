import { envManager } from "../utils/environment";

export async function statusAction(
  environment: "localhost" | "dev" | "prod"
): Promise<void> {
  console.log(`📊 Status for ${environment}`);
  envManager.printEnvironmentStatus(environment);
}

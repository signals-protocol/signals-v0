import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// 배포 설정
const DEPLOY_KEY = "5f235f324534eeef71580f6613839a2a";
const SUBGRAPH_NAME = "signals-v-0";
const SUBGRAPH_DIR = "./clmsr-subgraph";

// 명령 실행 함수
async function runCommand(command: string, cwd?: string): Promise<void> {
  console.log(`🔧 실행: ${command}`);
  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);
  } catch (error: any) {
    console.error(`❌ 오류: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.log(error.stderr);
    throw error;
  }
}

// 배포 상태 확인
async function checkDeploymentStatus(): Promise<void> {
  console.log("\n🔍 배포 상태 확인 중...");

  const testQuery = `
    query TestQuery {
      markets {
        id
        marketId
        numTicks
      }
    }
  `;

  try {
    const axios = require("axios");
    const response = await axios.post(
      "https://api.studio.thegraph.com/query/116469/signals-v-0/version/latest",
      { query: testQuery },
      { timeout: 10000 }
    );

    if (response.data && response.data.data) {
      console.log("✅ 서브그래프가 정상적으로 응답합니다!");
      console.log(`📊 마켓 수: ${response.data.data.markets?.length || 0}개`);
    } else {
      console.log("⚠️ 서브그래프가 응답하지만 데이터가 없습니다.");
    }
  } catch (error: any) {
    console.log("❌ 서브그래프가 아직 응답하지 않습니다:", error.message);
    console.log("💡 배포가 완료되려면 몇 분이 더 필요할 수 있습니다.");
  }
}

// 메인 배포 함수
async function deploySubgraph(): Promise<void> {
  console.log("🚀 CLMSR 서브그래프 배포 시작!\n");

  try {
    // 1. 서브그래프 디렉토리로 이동 및 의존성 확인
    console.log("📦 의존성 확인 중...");
    await runCommand("yarn install", SUBGRAPH_DIR);

    // 2. 코드 생성
    console.log("\n🔨 코드 생성 중...");
    await runCommand("npm run codegen", SUBGRAPH_DIR);

    // 3. 빌드
    console.log("\n🏗️ 서브그래프 빌드 중...");
    await runCommand("npm run build", SUBGRAPH_DIR);

    // 4. 배포
    console.log("\n🚀 서브그래프 배포 중...");
    await runCommand(
      `graph deploy ${SUBGRAPH_NAME} --deploy-key ${DEPLOY_KEY}`,
      SUBGRAPH_DIR
    );

    console.log("\n✅ 배포 명령이 완료되었습니다!");
    console.log(
      "⏳ 서브그래프가 동기화되기까지 몇 분 정도 소요될 수 있습니다.\n"
    );

    // 5. 잠시 대기 후 상태 확인
    console.log("⏱️ 10초 후 배포 상태를 확인합니다...");
    setTimeout(async () => {
      await checkDeploymentStatus();
    }, 10000);
  } catch (error: any) {
    console.error("\n❌ 배포 중 오류가 발생했습니다:", error.message);
    console.log("\n🔧 문제 해결 방법:");
    console.log(
      "1. Graph CLI가 설치되어 있는지 확인: npm install -g @graphprotocol/graph-cli"
    );
    console.log("2. 배포 키가 올바른지 확인");
    console.log("3. 네트워크 연결 상태 확인");
    console.log("4. The Graph Studio에서 서브그래프 상태 확인");

    process.exit(1);
  }
}

// 빠른 상태 확인 함수
async function quickCheck(): Promise<void> {
  console.log("🔍 서브그래프 상태 빠른 확인...\n");
  await checkDeploymentStatus();
}

// 스크립트 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--check")) {
    await quickCheck();
  } else {
    await deploySubgraph();
  }
}

// 실행
if (require.main === module) {
  main().catch(console.error);
}

export { deploySubgraph, checkDeploymentStatus };

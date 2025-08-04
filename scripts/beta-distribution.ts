import { ethers } from "hardhat";
import { parseUnits } from "ethers";
import * as fs from "fs";
import * as path from "path";

interface BetaAddress {
  address: string;
  sent: boolean;
  timestamp?: string;
  txHash?: {
    eth?: string;
    susd?: string;
  };
}

interface BetaConfig {
  network: string;
  chainId: number;
  usdcAddress: string;
  ethAmount: string; // ETH amount in ether units
  usdcAmount: string; // SUSD amount (will be converted to 6 decimals)
  addresses: BetaAddress[];
}

const CONFIG_FILE = path.join(__dirname, "..", "beta-addresses.json");

// 기본 설정 - Base 메인넷
const DEFAULT_CONFIG: Omit<BetaConfig, "addresses"> = {
  network: "base",
  chainId: 8453,
  usdcAddress: "0x78070bF4525A5A5600Ff97220139a6F77F840A96", // SUSD Token
  ethAmount: "0.0001", // 0.0001 ETH
  usdcAmount: "1000", // 1000 SUSD
};

function loadConfig(): BetaConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    const initialConfig: BetaConfig = {
      ...DEFAULT_CONFIG,
      addresses: [],
    };
    saveConfig(initialConfig);
    return initialConfig;
  }

  try {
    const data = fs.readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("❌ 설정 파일 읽기 실패:", error);
    throw error;
  }
}

function saveConfig(config: BetaConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
    console.log("💾 설정 파일 저장 완료");
  } catch (error) {
    console.error("❌ 설정 파일 저장 실패:", error);
    throw error;
  }
}

function validateAddress(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

async function sendTokens(
  recipient: string,
  ethAmount: string,
  usdcAmount: string,
  usdcContract: any,
  signer: any
): Promise<{ ethTx: string; susdTx: string }> {
  console.log(`💸 ${recipient}에게 송금 시작...`);

  // ETH 송금
  console.log(`  📤 ${ethAmount} ETH 송금 중...`);
  const ethTx = await signer.sendTransaction({
    to: recipient,
    value: parseUnits(ethAmount, 18),
  });
  await ethTx.wait();
  console.log(`  ✅ ETH 송금 완료: ${ethTx.hash}`);

  // SUSD 송금
  console.log(`  📤 ${usdcAmount} SUSD 송금 중...`);
  const usdcAmountParsed = parseUnits(usdcAmount, 6); // SUSD는 6 decimals
  const susdTx = await usdcContract.transfer(recipient, usdcAmountParsed);
  await susdTx.wait();
  console.log(`  ✅ SUSD 송금 완료: ${susdTx.hash}`);

  return {
    ethTx: ethTx.hash,
    susdTx: susdTx.hash,
  };
}

async function sendToBetaUsers(): Promise<void> {
  const [signer] = await ethers.getSigners();
  console.log("🚀 클로즈드 베타 배포 시작");
  console.log("👤 송금 계정:", signer.address);
  console.log(
    "💰 ETH 잔액:",
    ethers.formatEther(await ethers.provider.getBalance(signer.address))
  );

  // 설정 로드
  const config = loadConfig();

  // 네트워크 확인
  const network = await ethers.provider.getNetwork();
  if (Number(network.chainId) !== config.chainId) {
    throw new Error(
      `❌ 네트워크 불일치: 현재 ${network.chainId}, 필요 ${config.chainId}`
    );
  }

  // SUSD 컨트랙트 연결
  const usdcContract = await ethers.getContractAt(
    "MockERC20",
    config.usdcAddress
  );
  console.log(
    "💰 SUSD 잔액:",
    ethers.formatUnits(await usdcContract.balanceOf(signer.address), 6)
  );

  // 아직 받지 않은 주소들 필터링
  const pendingAddresses = config.addresses.filter((addr) => !addr.sent);

  if (pendingAddresses.length === 0) {
    console.log("✅ 모든 주소에 송금 완료!");
    return;
  }

  console.log(`📋 ${pendingAddresses.length}개 주소에 송금 예정:`);
  pendingAddresses.forEach((addr) => console.log(`  - ${addr.address}`));

  // 각 주소에 송금
  for (const addressInfo of pendingAddresses) {
    try {
      const { ethTx, susdTx } = await sendTokens(
        addressInfo.address,
        config.ethAmount,
        config.usdcAmount,
        usdcContract,
        signer
      );

      // 기록 업데이트
      addressInfo.sent = true;
      addressInfo.timestamp = new Date().toISOString();
      addressInfo.txHash = { eth: ethTx, susd: susdTx };

      // 설정 저장
      saveConfig(config);

      console.log(`✅ ${addressInfo.address} 송금 완료! ✓`);

      // 다음 송금 전 잠시 대기 (네트워크 부하 방지)
      if (pendingAddresses.indexOf(addressInfo) < pendingAddresses.length - 1) {
        console.log("⏳ 3초 대기 중...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (error) {
      console.error(`❌ ${addressInfo.address} 송금 실패:`, error);
      // 실패해도 다음 주소 계속 진행
    }
  }

  console.log("🎉 배포 완료!");
}

async function sendToAddress(
  address: string,
  force: boolean = false
): Promise<void> {
  if (!validateAddress(address)) {
    throw new Error(`❌ 잘못된 주소: ${address}`);
  }

  const [signer] = await ethers.getSigners();
  const config = loadConfig();

  // 기존 주소 확인
  const existingAddr = config.addresses.find(
    (addr) => addr.address.toLowerCase() === address.toLowerCase()
  );

  if (existingAddr && existingAddr.sent && !force) {
    console.log(
      `⚠️  ${address}는 이미 송금 완료된 주소입니다. force=true로 다시 시도하세요.`
    );
    return;
  }

  console.log(`🎯 ${address}에게 개별 송금 ${force ? "(강제)" : ""}`);

  // SUSD 컨트랙트 연결
  const usdcContract = await ethers.getContractAt(
    "MockERC20",
    config.usdcAddress
  );

  try {
    const { ethTx, susdTx } = await sendTokens(
      address,
      config.ethAmount,
      config.usdcAmount,
      usdcContract,
      signer
    );

    // 주소 목록에 추가 또는 업데이트
    if (existingAddr) {
      existingAddr.sent = true;
      existingAddr.timestamp = new Date().toISOString();
      existingAddr.txHash = { eth: ethTx, susd: susdTx };
    } else {
      config.addresses.push({
        address,
        sent: true,
        timestamp: new Date().toISOString(),
        txHash: { eth: ethTx, susd: susdTx },
      });
    }

    saveConfig(config);
    console.log(`✅ ${address} 송금 완료!`);
  } catch (error) {
    console.error(`❌ ${address} 송금 실패:`, error);
    throw error;
  }
}

function addAddresses(addresses: string[]): void {
  const config = loadConfig();
  let addedCount = 0;

  for (const address of addresses) {
    if (!validateAddress(address)) {
      console.warn(`⚠️  잘못된 주소 건너뛰기: ${address}`);
      continue;
    }

    // 이미 존재하는 주소인지 확인
    const exists = config.addresses.some(
      (addr) => addr.address.toLowerCase() === address.toLowerCase()
    );

    if (!exists) {
      config.addresses.push({
        address,
        sent: false,
      });
      addedCount++;
      console.log(`➕ 주소 추가: ${address}`);
    } else {
      console.log(`⚠️  이미 존재하는 주소: ${address}`);
    }
  }

  if (addedCount > 0) {
    saveConfig(config);
    console.log(`✅ ${addedCount}개 주소 추가 완료!`);
  }
}

// ====== SUSD 주소 업데이트 기능 ======
function updateSusdAddress(newAddress?: string): void {
  console.log("🔄 SUSD 주소 업데이트 중...");

  let susdAddress = newAddress;

  // 주소가 제공되지 않으면 최신 배포 파일에서 가져오기
  if (!susdAddress) {
    susdAddress = getLatestDeploymentSusdAddress();
    if (!susdAddress) {
      throw new Error(
        `❌ SUSD 주소를 찾을 수 없습니다. 배포 파일을 확인하세요.`
      );
    }
    console.log(`📄 최신 배포 파일에서 SUSD 주소 자동 감지: ${susdAddress}`);
  }

  if (!validateAddress(susdAddress)) {
    throw new Error(`❌ 잘못된 SUSD 주소: ${susdAddress}`);
  }

  const config = loadConfig();
  const oldAddress = config.usdcAddress;
  config.usdcAddress = susdAddress;
  saveConfig(config);

  console.log(`✅ SUSD 주소 업데이트 완료!`);
  console.log(`  이전: ${oldAddress}`);
  console.log(`  현재: ${susdAddress}`);
}

function getLatestDeploymentSusdAddress(): string | null {
  const deploymentsDir = path.join(__dirname, "../deployments");

  if (!fs.existsSync(deploymentsDir)) {
    return null;
  }

  const deploymentFiles = fs
    .readdirSync(deploymentsDir)
    .filter((file) => file.startsWith("deployment-") && file.endsWith(".json"))
    .sort((a, b) => {
      // 파일명에서 타임스탬프 추출하여 최신 파일 찾기
      const timestampA = parseInt(
        a.split("-").pop()?.replace(".json", "") || "0"
      );
      const timestampB = parseInt(
        b.split("-").pop()?.replace(".json", "") || "0"
      );
      return timestampB - timestampA;
    });

  if (deploymentFiles.length === 0) {
    return null;
  }

  try {
    const latestFile = path.join(deploymentsDir, deploymentFiles[0]);
    const deploymentData = JSON.parse(fs.readFileSync(latestFile, "utf8"));
    return deploymentData.contracts?.SUSD || null;
  } catch (error) {
    console.error("❌ 배포 파일 읽기 실패:", error);
    return null;
  }
}

// ====== 중복 검사/정리 기능 ======
function checkDuplicates(): { address: string; indices: number[] }[] {
  console.log("🔍 베타 주소 중복 검사 시작...");
  const config = loadConfig();

  const addressMap = new Map<string, number[]>();
  const duplicates: { address: string; indices: number[] }[] = [];

  // 중복 주소 찾기
  config.addresses.forEach((addr, index) => {
    const normalizedAddress = addr.address.toLowerCase();

    if (addressMap.has(normalizedAddress)) {
      addressMap.get(normalizedAddress)!.push(index);
    } else {
      addressMap.set(normalizedAddress, [index]);
    }
  });

  // 중복 리스트 생성
  for (const [address, indices] of addressMap.entries()) {
    if (indices.length > 1) {
      duplicates.push({
        address: config.addresses[indices[0]].address, // 원본 케이스 보존
        indices,
      });
    }
  }

  console.log(`📊 총 주소 수: ${config.addresses.length}`);
  console.log(`📊 고유 주소 수: ${addressMap.size}`);
  console.log(`🔄 중복 주소 수: ${duplicates.length}`);

  if (duplicates.length > 0) {
    console.log("\n🚨 중복 주소 발견:");
    duplicates.forEach((dup, i) => {
      console.log(`\n${i + 1}. ${dup.address}`);
      console.log(`   인덱스: ${dup.indices.join(", ")}`);

      dup.indices.forEach((index) => {
        const addr = config.addresses[index];
        console.log(
          `   [${index}] sent: ${addr.sent}, timestamp: ${addr.timestamp}`
        );
      });
    });
  } else {
    console.log("✅ 중복 주소가 없습니다!");
  }

  return duplicates;
}

function removeDuplicates(strategy: "latest" | "latest-sent" = "latest"): void {
  console.log(`🛠️ 중복 제거 시작 (전략: ${strategy})...`);
  const config = loadConfig();

  const addressMap = new Map<string, BetaAddress>();

  config.addresses.forEach((addr) => {
    const normalizedAddress = addr.address.toLowerCase();

    if (addressMap.has(normalizedAddress)) {
      const existing = addressMap.get(normalizedAddress)!;
      const current = addr;

      let shouldReplace = false;

      if (strategy === "latest") {
        // 가장 최근 타임스탬프
        shouldReplace =
          new Date(current.timestamp || 0) > new Date(existing.timestamp || 0);
      } else if (strategy === "latest-sent") {
        // sent=true 중에서 가장 최근, sent=false면 무시
        if (current.sent && existing.sent) {
          shouldReplace =
            new Date(current.timestamp || 0) >
            new Date(existing.timestamp || 0);
        } else if (current.sent && !existing.sent) {
          shouldReplace = true;
        }
      }

      if (shouldReplace) {
        addressMap.set(normalizedAddress, current);
      }
    } else {
      addressMap.set(normalizedAddress, addr);
    }
  });

  const cleanedAddresses = Array.from(addressMap.values()).sort(
    (a, b) =>
      new Date(a.timestamp || 0).getTime() -
      new Date(b.timestamp || 0).getTime()
  );

  // 백업 생성
  const backupPath = path.join(
    __dirname,
    `../beta-addresses.backup.${Date.now()}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(config, null, 2));
  console.log(`📄 백업 생성: ${path.basename(backupPath)}`);

  const originalCount = config.addresses.length;
  config.addresses = cleanedAddresses;
  saveConfig(config);

  console.log(`✅ 중복 제거 완료!`);
  console.log(`📊 제거 전: ${originalCount}개 주소`);
  console.log(`📊 제거 후: ${cleanedAddresses.length}개 주소`);
  console.log(`🗑️ 제거된 항목: ${originalCount - cleanedAddresses.length}개`);
}

// ====== 초기화 기능 ======
function resetBetaDistribution(): void {
  console.log("🔄 베타 배포 상태 초기화 중...");
  const config = loadConfig();

  // 백업 생성
  const backupPath = path.join(
    __dirname,
    `../beta-addresses.reset-backup.${Date.now()}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(config, null, 2));
  console.log(`📄 초기화 전 백업 생성: ${path.basename(backupPath)}`);

  let resetCount = 0;
  config.addresses.forEach((addr) => {
    if (addr.sent) {
      addr.sent = false;
      delete addr.timestamp;
      delete addr.txHash;
      resetCount++;
    }
  });

  saveConfig(config);
  console.log(`✅ ${resetCount}개 주소 초기화 완료!`);
  console.log("이제 'send' 명령어로 모든 주소에 다시 송금할 수 있습니다.");
}

function showStatus(): void {
  const config = loadConfig();

  console.log("\n📊 클로즈드 베타 배포 현황");
  console.log("================================");
  console.log(`🌐 네트워크: ${config.network} (${config.chainId})`);
  console.log(
    `💰 송금 금액: ${config.ethAmount} ETH + ${config.usdcAmount} SUSD`
  );
  console.log(`💰 SUSD 주소: ${config.usdcAddress}`);
  console.log(`📝 총 주소 수: ${config.addresses.length}`);

  const sentCount = config.addresses.filter((addr) => addr.sent).length;
  const pendingCount = config.addresses.length - sentCount;

  console.log(`✅ 송금 완료: ${sentCount}`);
  console.log(`⏳ 송금 대기: ${pendingCount}`);

  // 중복 검사 결과도 표시
  const duplicates = checkDuplicates();
  if (duplicates.length > 0) {
    console.log(`⚠️ 중복 주소: ${duplicates.length}개`);
  }

  if (config.addresses.length > 0) {
    console.log("\n📋 주소 목록:");
    config.addresses.forEach((addr, index) => {
      const status = addr.sent ? "✅" : "⏳";
      const timestamp = addr.timestamp
        ? ` (${addr.timestamp.split("T")[0]})`
        : "";
      console.log(`  ${index + 1}. ${status} ${addr.address}${timestamp}`);
    });
  }

  console.log("================================\n");
}

// CLI 인터페이스
async function main() {
  // 환경변수 또는 첫 번째 argument로 명령어 받기
  const command = process.env.BETA_COMMAND || process.argv[2] || "help";

  try {
    switch (command) {
      case "update-susd":
        const susdAddress = process.env.BETA_SUSD_ADDRESS;
        updateSusdAddress(susdAddress); // 주소가 없으면 자동으로 최신 배포에서 가져옴
        break;

      case "send":
        await sendToBetaUsers();
        break;

      case "send-to":
        const targetAddress = process.env.BETA_ADDRESS;
        if (!targetAddress) {
          console.error("❌ BETA_ADDRESS 환경변수로 주소를 설정하세요");
          process.exit(1);
        }
        const force = process.env.BETA_FORCE === "true";
        await sendToAddress(targetAddress, force);
        break;

      case "add":
        const newAddresses = process.env.BETA_ADDRESSES
          ? process.env.BETA_ADDRESSES.split(",")
          : [];
        if (newAddresses.length === 0) {
          console.error(
            "❌ BETA_ADDRESSES 환경변수로 주소들을 설정하세요 (콤마로 구분)"
          );
          process.exit(1);
        }
        addAddresses(newAddresses);
        break;

      case "status":
        showStatus();
        break;

      case "check-duplicates":
        checkDuplicates();
        break;

      case "clean-duplicates":
        const strategy =
          (process.env.BETA_STRATEGY as "latest" | "latest-sent") || "latest";
        removeDuplicates(strategy);
        break;

      case "reset":
        resetBetaDistribution();
        break;

      case "init":
        // 초기 주소들 추가
        const initialAddresses = [
          "0x88Ff4481EfBBc8dE4856A19f89308047Ce641289",
          "0x98f543C02d6a6dD16329372991bcabb3B70684cb",
          "0x6b055d4ad9eedfD9B8DE61bE00232a5257c6DAE3",
          "0x162CF24de96b6E18fB795D612Dbcf641892ddA89",
          "0x9b5065012ebdd81c397d2e8a3d986142ee6cf8b1",
        ];
        addAddresses(initialAddresses);
        console.log(
          "🎯 초기 주소 설정 완료! 이제 'npm run beta send'로 송금하세요."
        );
        break;

      default:
        console.log("🎯 클로즈드 베타 사용자 관리 스크립트");
        console.log("\n🔧 설정 관리:");
        console.log(
          "  BETA_COMMAND=update-susd npm run beta       - 최신 배포에서 SUSD 주소 자동 업데이트"
        );
        console.log(
          "  BETA_COMMAND=update-susd BETA_SUSD_ADDRESS=<addr> npm run beta - 특정 SUSD 주소로 업데이트"
        );
        console.log("\n📋 주소 관리:");
        console.log(
          "  BETA_COMMAND=add BETA_ADDRESSES=<addr1,addr2> npm run beta - 새 주소들 추가"
        );
        console.log(
          "  BETA_COMMAND=check-duplicates npm run beta  - 중복 주소 검사"
        );
        console.log(
          "  BETA_COMMAND=clean-duplicates npm run beta  - 중복 주소 제거"
        );
        console.log(
          "  BETA_COMMAND=clean-duplicates BETA_STRATEGY=latest-sent npm run beta - sent=true 중 최신만 유지"
        );
        console.log("\n💸 토큰 전송:");
        console.log(
          "  BETA_COMMAND=send npm run beta              - 대기 중인 모든 주소에 송금"
        );
        console.log(
          "  BETA_COMMAND=send-to BETA_ADDRESS=<addr> npm run beta - 특정 주소에 송금"
        );
        console.log(
          "  BETA_COMMAND=send-to BETA_ADDRESS=<addr> BETA_FORCE=true npm run beta - 강제 재송금"
        );
        console.log(
          "  BETA_COMMAND=reset npm run beta             - 모든 전송 상태 초기화"
        );
        console.log("\n📊 상태 확인:");
        console.log(
          "  BETA_COMMAND=status npm run beta            - 현재 상태 확인"
        );
        console.log(
          "  BETA_COMMAND=init npm run beta              - 초기 주소들 설정"
        );
        break;
    }
  } catch (error) {
    console.error("❌ 실행 실패:", error);
    process.exit(1);
  }
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export {
  updateSusdAddress,
  sendToBetaUsers,
  sendToAddress,
  addAddresses,
  showStatus,
  checkDuplicates,
  removeDuplicates,
  resetBetaDistribution,
};

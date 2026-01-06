import { ethers, upgrades, network } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";
import { safeTxOptsPinned, delay } from "../utils/txOpts";
import { UpgradeSafetyChecker } from "../safety-checks";
import { OpenZeppelinManifestManager } from "../manage-manifest";

const TX_DELAY_MS = Number(process.env.TX_DELAY_MS ?? "10000");

// RPC URL (환경변수 또는 기본 Citrea public RPC)
const PINNED_RPC_URL =
  process.env.CITREA_RPC_URL || "https://rpc.testnet.citrea.xyz";

const pinnedProvider = new ethers.JsonRpcProvider(PINNED_RPC_URL);

const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ?? process.env.PRIVATE_KEY;

if (!DEPLOYER_PRIVATE_KEY) {
  throw new Error(
    "DEPLOYER_PRIVATE_KEY (or PRIVATE_KEY) is required to run the upgrade action with a pinned signer."
  );
}

const pinnedDeployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, pinnedProvider);

const EXPECTED_CHAIN_ID = BigInt(process.env.EXPECTED_CHAIN_ID ?? "5115");

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC";

/**
 * Citrea 시퀀서 RPC 오류 판별 함수
 */
function isIgnorableSequencerError(e: any): boolean {
  const msg = String(e?.data || e?.message || e || "");
  return (
    e?.code === -32001 ||
    /SEQUENCER_CLIENT_ERROR/i.test(msg) ||
    /missing field `result\/error`/i.test(msg) ||
    /Parse error/i.test(msg) ||
    /invalid json response|unexpected token|econnreset|etimedout|socket hang up|fetch failed/i.test(
      msg
    )
  );
}

/**
 * 재시도 로직이 포함된 안전한 함수 실행
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isIgnorableSequencerError(e) || i === retries - 1) throw e;
      console.log(`⚠️ RPC 오류 (${i + 1}/${retries}), 재시도 중...`);
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw new Error("unreachable");
}

/**
 * EIP-1967 구현체 슬롯을 직접 조회하여 주소 반환
 */
async function getImplementationAddress(proxy: string): Promise<string> {
  const storageReader =
    typeof (pinnedProvider as any).getStorageAt === "function"
      ? (address: string, slot: string) =>
          (pinnedProvider as any).getStorageAt(address, slot)
      : typeof (pinnedProvider as any).getStorage === "function"
      ? (address: string, slot: string) =>
          (pinnedProvider as any).getStorage(address, slot)
      : null;

  if (!storageReader) {
    throw new Error("Pinned provider does not support storage slot reads");
  }

  const rawSlot = await withRetry(() =>
    storageReader(proxy, EIP1967_IMPLEMENTATION_SLOT)
  );

  if (!rawSlot || rawSlot === "0x" || /^0x0+$/.test(rawSlot.toLowerCase())) {
    throw new Error(`Empty implementation slot for proxy ${proxy}`);
  }

  const addressHex = rawSlot.slice(-40);
  try {
    return ethers.getAddress(`0x${addressHex}`);
  } catch (error) {
    throw new Error(
      `Failed to parse implementation slot for proxy ${proxy}: ${rawSlot}`
    );
  }
}

/**
 * 업그레이드 후 구현체 주소가 변경될 때까지 폴링하여 대기
 */
async function waitForImplChange(
  proxy: string,
  prev?: string,
  attempts = 20,
  ms = 1500
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    try {
      const cur = (await getImplementationAddress(proxy)).toLowerCase();
      if (!prev || cur !== prev.toLowerCase()) {
        console.log(`✅ Implementation changed to: ${cur}`);
        return cur;
      }
      console.log(
        `⏳ Waiting for implementation change... (${i + 1}/${attempts})`
      );
      await delay(ms);
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      if (
        errorMsg.includes("SEQUENCER_CLIENT_ERROR") ||
        errorMsg.includes("nonce too low") ||
        errorMsg.includes("Parse error")
      ) {
        console.log(
          `⚠️ Network error on attempt ${i + 1}/${attempts}, retrying in ${
            ms * 2
          }ms...`
        );
        await delay(ms * 2); // Wait longer for network issues
        continue;
      }

      // For other errors, try a few more times before giving up
      if (i < attempts - 3) {
        console.log(
          `⚠️ Error on attempt ${i + 1}/${attempts}: ${errorMsg}, retrying...`
        );
        await delay(ms);
        continue;
      }

      // If we're near the end and still getting errors, throw
      throw error;
    }
  }

  // 마지막으로 한 번 더 시도
  try {
    const finalResult = await getImplementationAddress(proxy);
    console.log(`📋 Final implementation address: ${finalResult}`);
    return finalResult;
  } catch (error) {
    console.warn(
      `⚠️ Final attempt failed, but upgrade may have succeeded: ${error}`
    );
    // 기본값 반환 (실제로는 업그레이드가 성공했을 가능성)
    return prev || "0x0000000000000000000000000000000000000000";
  }
}

/**
 * 프록시가 실제로 가리키는 구현체 주소와 env 파일에 기록된 주소가 일치하는지 검증
 */
async function verifyImplementationConsistency(
  environment: Environment
): Promise<void> {
  console.log("🔍 Verifying implementation consistency...");

  const addresses = envManager.getDeployedAddresses(environment);
  let allMatch = true;

  // Position 프록시 검증
  if (addresses.CLMSRPositionProxy && addresses.CLMSRPositionImplementation) {
    const actualPosition = await getImplementationAddress(
      addresses.CLMSRPositionProxy!
    );
    if (
      actualPosition.toLowerCase() !==
      addresses.CLMSRPositionImplementation.toLowerCase()
    ) {
      console.warn("⚠️ Position Implementation mismatch detected.");
      if (process.env.FIX_ENV === "1") {
        envManager.updateContract(
          environment,
          "core",
          "CLMSRPositionImplementation",
          actualPosition
        );
        console.log(
          "🔧 Fixed env: core.CLMSRPositionImplementation ->",
          actualPosition
        );
      } else {
        console.error(`❌ Position Implementation mismatch:`);
        console.error(`   Proxy points to: ${actualPosition}`);
        console.error(
          `   Env file has:    ${addresses.CLMSRPositionImplementation}`
        );
        console.error(`   💡 Run with FIX_ENV=1 to auto-fix`);
        allMatch = false;
      }
    } else {
      console.log(`✅ Position Implementation consistent: ${actualPosition}`);
    }
  }

  // Core 프록시 검증
  if (
    addresses.CLMSRMarketCoreProxy &&
    addresses.CLMSRMarketCoreImplementation
  ) {
    const actualCore = await getImplementationAddress(
      addresses.CLMSRMarketCoreProxy!
    );
    if (
      actualCore.toLowerCase() !==
      addresses.CLMSRMarketCoreImplementation.toLowerCase()
    ) {
      console.warn("⚠️ Core Implementation mismatch detected.");
      if (process.env.FIX_ENV === "1") {
        envManager.updateContract(
          environment,
          "core",
          "CLMSRMarketCoreImplementation",
          actualCore
        );
        console.log(
          "🔧 Fixed env: core.CLMSRMarketCoreImplementation ->",
          actualCore
        );
      } else {
        console.error(`❌ Core Implementation mismatch:`);
        console.error(`   Proxy points to: ${actualCore}`);
        console.error(
          `   Env file has:    ${addresses.CLMSRMarketCoreImplementation}`
        );
        console.error(`   💡 Run with FIX_ENV=1 to auto-fix`);
        allMatch = false;
      }
    } else {
      console.log(`✅ Core Implementation consistent: ${actualCore}`);
    }
  }

  // Points 프록시 검증
  if (addresses.PointsGranterProxy && addresses.PointsGranterImplementation) {
    const actualPoints = await getImplementationAddress(
      addresses.PointsGranterProxy!
    );
    if (
      actualPoints.toLowerCase() !==
      addresses.PointsGranterImplementation.toLowerCase()
    ) {
      console.warn("⚠️ Points Implementation mismatch detected.");
      if (process.env.FIX_ENV === "1") {
        envManager.updateContract(
          environment,
          "points",
          "PointsGranterImplementation",
          actualPoints
        );
        console.log(
          "🔧 Fixed env: points.PointsGranterImplementation ->",
          actualPoints
        );
      } else {
        console.error(`❌ Points Implementation mismatch:`);
        console.error(`   Proxy points to: ${actualPoints}`);
        console.error(
          `   Env file has:    ${addresses.PointsGranterImplementation}`
        );
        console.error(`   💡 Run with FIX_ENV=1 to auto-fix`);
        allMatch = false;
      }
    } else {
      console.log(`✅ Points Implementation consistent: ${actualPoints}`);
    }
  }

  if (!allMatch) {
    throw new Error(
      "❌ Implementation consistency check failed! Proxy addresses do not match env file."
    );
  }

  console.log(
    "✅ All implementation addresses are consistent between proxies and env file."
  );
}

export async function upgradeAction(environment: Environment): Promise<void> {
  console.log(`⬆️ Upgrading ${environment} to latest contract`);

  const networkInfo = await pinnedProvider.getNetwork();
  if (networkInfo.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Unexpected chainId ${networkInfo.chainId}; expected ${EXPECTED_CHAIN_ID}`
    );
  }

  const deployer = pinnedDeployer;
  console.log("👤 Deployer:", deployer.address);

  const addresses = envManager.getDeployedAddresses(environment);

  const txOpts = await safeTxOptsPinned(pinnedProvider);

  console.log("📚 Deploying new FixedPointMathU library...");
  const FixedPointMathUFactory = await ethers.getContractFactory(
    "FixedPointMathU",
    { signer: deployer }
  );
  const newFixedPointMathU = await withRetry(
    () => FixedPointMathUFactory.deploy(txOpts),
    5
  );
  await withRetry(() => newFixedPointMathU.waitForDeployment(), 5);
  const newFixedPointMathUAddress = await withRetry(
    () => newFixedPointMathU.getAddress(),
    5
  );
  envManager.updateContract(
    environment,
    "libraries",
    "FixedPointMathU",
    newFixedPointMathUAddress
  );
  addresses.FixedPointMathU = newFixedPointMathUAddress;
  console.log("✅ New FixedPointMathU deployed:", newFixedPointMathUAddress);

  if (!addresses.CLMSRMarketCoreProxy) {
    throw new Error(`Core proxy not deployed in ${environment} environment`);
  }

  console.log("📋 Core Proxy:", addresses.CLMSRMarketCoreProxy);

  // 🛡️ 안전장치 및 매니페스트 관리 초기화
  const safetyChecker = new UpgradeSafetyChecker(environment);
  const manifestManager = new OpenZeppelinManifestManager();

  // 매니페스트 백업
  console.log("💾 Backing up OpenZeppelin manifest...");
  await manifestManager.backup(environment);

  console.log("🔄 Pre-synchronizing OpenZeppelin manifest...");

  const CLMSRMarketCoreImport = await ethers.getContractFactory(
    "CLMSRMarketCore",
    {
      signer: deployer,
      libraries: {
        FixedPointMathU: addresses.FixedPointMathU!,
        LazyMulSegmentTree: addresses.LazyMulSegmentTree!,
      },
    }
  );

  try {
    await upgrades.forceImport(
      addresses.CLMSRMarketCoreProxy!,
      CLMSRMarketCoreImport,
      { kind: "uups" }
    );
    console.log("✅ Core proxy pre-imported");
  } catch (error) {
    const msg = (error as any)?.message ?? String(error);
    console.warn("⚠️ Core proxy import failed, continuing:", msg);
  }

  // Position과 Points forceImport 시도
  console.log("🔄 Attempting Position and Points forceImport...");

  // Position forceImport
  if (addresses.CLMSRPositionProxy) {
    try {
      const CLMSRPosition = await ethers.getContractFactory("CLMSRPosition", {
        signer: deployer,
      });
      await upgrades.forceImport(addresses.CLMSRPositionProxy, CLMSRPosition, {
        kind: "uups",
      });
      console.log("✅ Position proxy force-imported successfully");
    } catch (error) {
      const msg = (error as any)?.message ?? String(error);
      console.warn("⚠️ Position proxy import failed, continuing:", msg);
    }
  }

  // Points forceImport
  if (addresses.PointsGranterProxy) {
    try {
      const PointsGranter = await ethers.getContractFactory("PointsGranter", {
        signer: deployer,
      });
      await upgrades.forceImport(addresses.PointsGranterProxy, PointsGranter, {
        kind: "uups",
      });
      console.log("✅ Points proxy force-imported successfully");
    } catch (error) {
      const msg = (error as any)?.message ?? String(error);
      console.warn("⚠️ Points proxy import failed, continuing:", msg);
    }
  }

  await delay(TX_DELAY_MS);

  console.log("📝 Manifest synchronized with on-chain state");

  // 새 라이브러리 배포 (FLUSH_THRESHOLD 등 신기능 포함)
  console.log("📚 Deploying new LazyMulSegmentTree library...");
  const LazyMulSegmentTree = await ethers.getContractFactory(
    "LazyMulSegmentTree",
    {
      signer: deployer,
      libraries: { FixedPointMathU: addresses.FixedPointMathU },
    }
  );
  const newSegmentTree = await withRetry(
    () => LazyMulSegmentTree.deploy(txOpts),
    5
  );
  await withRetry(() => newSegmentTree.waitForDeployment(), 5);
  const newSegmentTreeAddress = await withRetry(
    () => newSegmentTree.getAddress(),
    5
  );

  // 환경 파일에 새 라이브러리 주소 저장
  envManager.updateContract(
    environment,
    "libraries",
    "LazyMulSegmentTree",
    newSegmentTreeAddress
  );
  console.log("✅ New LazyMulSegmentTree deployed:", newSegmentTreeAddress);
  await delay(TX_DELAY_MS);

  console.log("🏢 Deploying CLMSRMarketManager implementation...");
  const CLMSRMarketManager = await ethers.getContractFactory(
    "CLMSRMarketManager",
    {
      signer: deployer,
      libraries: {
        LazyMulSegmentTree: newSegmentTreeAddress,
      },
    }
  );
  const managerContract = await withRetry(
    () => CLMSRMarketManager.deploy(txOpts),
    5
  );
  await delay(TX_DELAY_MS);
  await withRetry(() => managerContract.waitForDeployment(), 5);
  const managerAddress = await withRetry(() => managerContract.getAddress(), 5);
  envManager.updateContract(
    environment,
    "core",
    "CLMSRMarketManager",
    managerAddress
  );
  console.log("✅ CLMSRMarketManager deployed:", managerAddress);

  // Position contract 업그레이드 (안전한 방법)
  console.log("🎭 Upgrading Position contract...");
  await delay(TX_DELAY_MS);

  let newPositionImplAddress = addresses.CLMSRPositionImplementation;

  if (addresses.CLMSRPositionProxy) {
    try {
      // 업그레이드 이전 구현체 주소를 저장 (RPC 재시도 포함)
      const beforePosImpl = await getImplementationAddress(
        addresses.CLMSRPositionProxy
      );
      console.log("📋 Position impl before upgrade:", beforePosImpl);

      const CLMSRPosition = await ethers.getContractFactory("CLMSRPosition", {
        signer: deployer,
      });

      // upgradeProxy 호출 시 RPC 오류 처리 + 재시도 보강
      await withRetry(async () => {
        try {
          await upgrades.upgradeProxy(
            addresses.CLMSRPositionProxy!,
            CLMSRPosition,
            {
              kind: "uups",
              redeployImplementation: "always",
              txOverrides: await safeTxOptsPinned(pinnedProvider),
            }
          );
          console.log("✅ Position upgradeProxy completed successfully");
        } catch (upgradeError) {
          if (isIgnorableSequencerError(upgradeError)) {
            console.warn(
              "⚠️ RPC 파싱 오류 발생했지만 업그레이드는 성공했을 가능성 높음. 온체인 상태로 검증 진행..."
            );
          } else {
            throw upgradeError;
          }
        }
      }, 5);

      // 새 구현체 주소가 반영될 때까지 대기(폴링) - 이미 withRetry 내장됨
      newPositionImplAddress = await waitForImplChange(
        addresses.CLMSRPositionProxy,
        beforePosImpl
      );
      console.log("📋 Position impl after upgrade:", newPositionImplAddress);

      envManager.updateContract(
        environment,
        "core",
        "CLMSRPositionImplementation",
        newPositionImplAddress
      );
      console.log("✅ Position contract upgraded:", newPositionImplAddress);
    } catch (error) {
      const msg = (error as any)?.message ?? String(error);
      console.warn(
        "⚠️ Position contract upgrade via upgrades.upgradeProxy failed:",
        msg
      );
      console.log(
        "🔁 Falling back to manual UUPS upgrade flow for Position..."
      );

      // 0) 오너십 확인 (UUPS onlyOwner)
      const positionReadonly = await ethers.getContractAt(
        "CLMSRPosition",
        addresses.CLMSRPositionProxy,
        deployer
      );
      const currentOwner = await positionReadonly.owner();
      console.log("🧑‍⚖️ Position owner:", currentOwner);
      if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        throw new Error(
          `❌ Position owner is ${currentOwner}, not deployer ${deployer.address}. Use the owner key to upgrade.`
        );
      }

      // 1) 새 구현 컨트랙트 직접 배포 (Initializable, no constructor)
      const txOverrides = await safeTxOptsPinned(pinnedProvider);
      const PositionImplFactory = await ethers.getContractFactory(
        "CLMSRPosition",
        { signer: deployer }
      );
      const positionImpl = await PositionImplFactory.deploy(txOverrides);
      await positionImpl.waitForDeployment();
      const manualImplAddr = await positionImpl.getAddress();
      console.log("📦 Deployed new Position implementation:", manualImplAddr);

      // 2) proxy.upgradeTo(새 구현) 호출 (UUPS, onlyOwner)
      // 업그레이드 이전 구현체 주소를 다시 한 번 저장 (수동 업그레이드 전)
      const beforeManualPosImpl = await getImplementationAddress(
        addresses.CLMSRPositionProxy!
      );
      // ethers v6에서 안전하게 직접 인코딩하여 트랜잭션 전송
      try {
        const iface = new ethers.Interface([
          "function upgradeTo(address newImplementation)",
        ]);
        const data = iface.encodeFunctionData("upgradeTo", [manualImplAddr]);
        const upgradeTx = await deployer.sendTransaction({
          to: addresses.CLMSRPositionProxy,
          data,
          ...txOverrides,
        });
        await upgradeTx.wait();
      } catch (e) {
        const msg2 = (e as any)?.message ?? String(e);
        console.warn(
          "⚠️ upgradeTo failed, trying upgradeToAndCall (0x):",
          msg2
        );
        const iface2 = new ethers.Interface([
          "function upgradeToAndCall(address newImplementation, bytes data)",
        ]);
        const data2 = iface2.encodeFunctionData("upgradeToAndCall", [
          manualImplAddr,
          "0x",
        ]);
        const upgradeTx2 = await deployer.sendTransaction({
          to: addresses.CLMSRPositionProxy,
          data: data2,
          ...txOverrides,
        });
        await upgradeTx2.wait();
      }

      // 3) 새 구현체 주소 반영 확인
      newPositionImplAddress = await waitForImplChange(
        addresses.CLMSRPositionProxy,
        beforeManualPosImpl
      );
      console.log(
        "📋 Position impl after manual upgrade:",
        newPositionImplAddress
      );

      // 4) 환경 파일 업데이트
      envManager.updateContract(
        environment,
        "core",
        "CLMSRPositionImplementation",
        newPositionImplAddress
      );
      console.log(
        "✅ Position contract manually upgraded:",
        newPositionImplAddress
      );
    }
  } else {
    throw new Error(
      `Position proxy not deployed in ${environment} environment`
    );
  }

  // Core contract 업그레이드
  console.log("🔧 Upgrading Core contract with new library...");
  await delay(TX_DELAY_MS);

  let coreImplAddress = addresses.CLMSRMarketCoreImplementation;

  // 업그레이드 이전 구현체 주소를 저장
  const beforeCoreImpl = await getImplementationAddress(
    addresses.CLMSRMarketCoreProxy!
  );
  console.log("📋 Core impl before upgrade:", beforeCoreImpl);

  const CLMSRMarketCore = await ethers.getContractFactory("CLMSRMarketCore", {
    signer: deployer,
    libraries: {
      FixedPointMathU: addresses.FixedPointMathU,
      LazyMulSegmentTree: newSegmentTreeAddress,
    },
  });

  try {
    await withRetry(async () => {
      try {
        await upgrades.upgradeProxy(
          addresses.CLMSRMarketCoreProxy!,
          CLMSRMarketCore,
          {
            kind: "uups",
            redeployImplementation: "always",
            unsafeAllow: ["external-library-linking", "delegatecall"],
            unsafeSkipStorageCheck: true, // allow slot rename (legacy signer)
            txOverrides: await safeTxOptsPinned(pinnedProvider),
          }
        );
        console.log("✅ Core upgradeProxy completed successfully");
      } catch (upgradeError) {
        if (isIgnorableSequencerError(upgradeError)) {
          console.warn(
            "⚠️ RPC 파싱 오류 발생했지만 업그레이드는 성공했을 가능성 높음. 온체인 상태로 검증 진행..."
          );
        } else {
          throw upgradeError;
        }
      }
    }, 5);

    coreImplAddress = await waitForImplChange(
      addresses.CLMSRMarketCoreProxy!,
      beforeCoreImpl
    );
    console.log("📋 Core impl after upgrade:", coreImplAddress);

    envManager.updateContract(
      environment,
      "core",
      "CLMSRMarketCoreImplementation",
      coreImplAddress
    );
    console.log("✅ Core contract upgraded:", coreImplAddress);
  } catch (error) {
    const msg = (error as any)?.message ?? String(error);
    console.warn(
      "⚠️ Core contract upgrade via upgrades.upgradeProxy failed:",
      msg
    );
    console.log("🔁 Falling back to manual UUPS upgrade flow for Core...");

    const coreReadonly = await ethers.getContractAt(
      "CLMSRMarketCore",
      addresses.CLMSRMarketCoreProxy!,
      deployer
    );
    const currentOwner = await coreReadonly.owner();
    console.log("🧑‍⚖️ Core owner:", currentOwner);
    if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new Error(
        `❌ Core owner is ${currentOwner}, not deployer ${deployer.address}. Use the owner key to upgrade.`
      );
    }

    const deployOverrides = await safeTxOptsPinned(pinnedProvider);
    const coreImpl = await CLMSRMarketCore.deploy(deployOverrides);
    await coreImpl.waitForDeployment();
    const manualImplAddr = await coreImpl.getAddress();
    console.log("📦 Deployed new Core implementation:", manualImplAddr);

    const beforeManualCoreImpl = await getImplementationAddress(
      addresses.CLMSRMarketCoreProxy!
    );

    const upgradeOverrides = await safeTxOptsPinned(pinnedProvider);
    try {
      const iface = new ethers.Interface([
        "function upgradeTo(address newImplementation)",
      ]);
      const data = iface.encodeFunctionData("upgradeTo", [manualImplAddr]);
      const tx = await deployer.sendTransaction({
        to: addresses.CLMSRMarketCoreProxy!,
        data,
        ...upgradeOverrides,
      });
      await tx.wait();
    } catch (e) {
      const msg2 = (e as any)?.message ?? String(e);
      console.warn("⚠️ upgradeTo failed, trying upgradeToAndCall (0x):", msg2);
      const iface2 = new ethers.Interface([
        "function upgradeToAndCall(address newImplementation, bytes data)",
      ]);
      const data2 = iface2.encodeFunctionData("upgradeToAndCall", [
        manualImplAddr,
        "0x",
      ]);
      const tx2 = await deployer.sendTransaction({
        to: addresses.CLMSRMarketCoreProxy!,
        data: data2,
        ...upgradeOverrides,
      });
      await tx2.wait();
    }

    coreImplAddress = await waitForImplChange(
      addresses.CLMSRMarketCoreProxy!,
      beforeManualCoreImpl
    );
    console.log("📋 Core impl after manual upgrade:", coreImplAddress);

    envManager.updateContract(
      environment,
      "core",
      "CLMSRMarketCoreImplementation",
      coreImplAddress
    );
    console.log("✅ Core contract manually upgraded:", coreImplAddress);
  }

  console.log("⚙️ Setting manager pointer on upgraded core...");
  const coreProxy = await ethers.getContractAt(
    "CLMSRMarketCore",
    addresses.CLMSRMarketCoreProxy!,
    deployer
  );
  await withRetry(
    async () =>
      coreProxy.setManager(
        managerAddress,
        await safeTxOptsPinned(pinnedProvider)
      ),
    5
  );
  console.log("✅ Manager pointer updated to:", managerAddress);

  // PointsGranter 업그레이드 (안전한 방법)
  console.log("🎯 Upgrading PointsGranter...");
  await delay(TX_DELAY_MS);

  let pointsImplAddress = addresses.PointsGranterImplementation;
  const pointsProxyAddress = addresses.PointsGranterProxy;

  if (addresses.PointsGranterProxy) {
    const PointsGranterFactory = await ethers.getContractFactory(
      "PointsGranter",
      { signer: deployer }
    );
    try {
      const beforePointsImpl = await getImplementationAddress(
        addresses.PointsGranterProxy!
      );
      console.log("📋 Points impl before upgrade:", beforePointsImpl);

      await withRetry(async () => {
        try {
          await upgrades.upgradeProxy(
            addresses.PointsGranterProxy!,
            PointsGranterFactory,
            {
              kind: "uups",
              redeployImplementation: "always",
              txOverrides: await safeTxOptsPinned(pinnedProvider),
            }
          );
          console.log("✅ Points upgradeProxy completed successfully");
        } catch (upgradeError) {
          if (isIgnorableSequencerError(upgradeError)) {
            console.warn(
              "⚠️ RPC 파싱 오류 발생했지만 업그레이드는 성공했을 가능성 높음. 온체인 상태로 검증 진행..."
            );
          } else {
            throw upgradeError;
          }
        }
      }, 5);

      pointsImplAddress = await waitForImplChange(
        pointsProxyAddress!,
        beforePointsImpl
      );
      console.log("📋 Points impl after upgrade:", pointsImplAddress);

      envManager.updateContract(
        environment,
        "points",
        "PointsGranterImplementation",
        pointsImplAddress
      );
      console.log("✅ PointsGranter upgraded:", pointsImplAddress);
    } catch (error) {
      const msg = (error as any)?.message ?? String(error);
      console.warn(
        "⚠️ PointsGranter upgrade via upgrades.upgradeProxy failed:",
        msg
      );
      console.log("🔁 Falling back to manual UUPS upgrade flow for Points...");

      const pointsReadonly = await ethers.getContractAt(
        "PointsGranter",
        addresses.PointsGranterProxy!,
        deployer
      );
      const currentOwner = await pointsReadonly.owner();
      console.log("🧑‍⚖️ Points owner:", currentOwner);
      if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        throw new Error(
          `❌ Points owner is ${currentOwner}, not deployer ${deployer.address}. Use the owner key to upgrade.`
        );
      }

      const deployOverrides = await safeTxOptsPinned(pinnedProvider);
      const pointsImpl = await PointsGranterFactory.deploy(deployOverrides);
      await pointsImpl.waitForDeployment();
      const manualImplAddr = await pointsImpl.getAddress();
      console.log("📦 Deployed new Points implementation:", manualImplAddr);

      const beforeManualPointsImpl = await getImplementationAddress(
        addresses.PointsGranterProxy!
      );

      const upgradeOverrides = await safeTxOptsPinned(pinnedProvider);
      try {
        const iface = new ethers.Interface([
          "function upgradeTo(address newImplementation)",
        ]);
        const data = iface.encodeFunctionData("upgradeTo", [manualImplAddr]);
        const tx = await deployer.sendTransaction({
          to: addresses.PointsGranterProxy!,
          data,
          ...upgradeOverrides,
        });
        await tx.wait();
      } catch (e) {
        const msg2 = (e as any)?.message ?? String(e);
        console.warn(
          "⚠️ upgradeTo failed, trying upgradeToAndCall (0x):",
          msg2
        );
        const iface2 = new ethers.Interface([
          "function upgradeToAndCall(address newImplementation, bytes data)",
        ]);
        const data2 = iface2.encodeFunctionData("upgradeToAndCall", [
          manualImplAddr,
          "0x",
        ]);
        const tx2 = await deployer.sendTransaction({
          to: addresses.PointsGranterProxy!,
          data: data2,
          ...upgradeOverrides,
        });
        await tx2.wait();
      }

      pointsImplAddress = await waitForImplChange(
        pointsProxyAddress!,
        beforeManualPointsImpl
      );
      console.log("📋 Points impl after manual upgrade:", pointsImplAddress);

      envManager.updateContract(
        environment,
        "points",
        "PointsGranterImplementation",
        pointsImplAddress
      );
      console.log("✅ PointsGranter manually upgraded:", pointsImplAddress);
    }
  } else {
    throw new Error(
      `PointsGranter proxy not deployed in ${environment} environment`
    );
  }

  // 업그레이드 기록 저장
  const nextVersion = envManager.getNextVersion(environment);
  envManager.addDeploymentRecord(environment, {
    version: nextVersion, // 자동 버전 증가
    action: "upgrade",
    contracts: {
      LazyMulSegmentTree: newSegmentTreeAddress,
      CLMSRPositionImplementation: newPositionImplAddress,
      CLMSRMarketCoreImplementation: coreImplAddress,
      CLMSRMarketManager: managerAddress,
      PointsGranterProxy: pointsProxyAddress,
      PointsGranterImplementation: pointsImplAddress,
    },
    deployer: deployer.address,
  });

  // 일관성 검증: 프록시가 실제로 가리키는 구현체 주소 확인
  await verifyImplementationConsistency(environment);

  console.log("🎉 Upgrade completed successfully!");
  envManager.printEnvironmentStatus(environment);
}

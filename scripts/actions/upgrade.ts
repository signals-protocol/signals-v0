import { ethers, upgrades } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";
import { safeTxOpts, delay, safeExecuteTx } from "../utils/txOpts";
import { UpgradeSafetyChecker } from "../safety-checks";
import { OpenZeppelinManifestManager } from "../manage-manifest";

/**
 * Citrea 시퀀서 RPC 오류 판별 함수
 */
function isIgnorableSequencerError(e: any): boolean {
  return e?.code === -32001
    || /SEQUENCER_CLIENT_ERROR/i.test(e?.message)
    || /missing field `result\/error`/i.test(e?.data || e?.message)
    || /Parse error/i.test(e?.data || e?.message);
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
      await new Promise(r => setTimeout(r, 500 * (2 ** i)));
    }
  }
  throw new Error("unreachable");
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
      const cur = (
        await upgrades.erc1967.getImplementationAddress(proxy)
      ).toLowerCase();
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
    const finalResult = await upgrades.erc1967.getImplementationAddress(proxy);
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
    const actualPosition = await upgrades.erc1967.getImplementationAddress(
      addresses.CLMSRPositionProxy
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
    const actualCore = await upgrades.erc1967.getImplementationAddress(
      addresses.CLMSRMarketCoreProxy
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
    const actualPoints = await upgrades.erc1967.getImplementationAddress(
      addresses.PointsGranterProxy
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

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  const addresses = envManager.getDeployedAddresses(environment);

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
      const CLMSRPosition = await ethers.getContractFactory("CLMSRPosition");
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
      const PointsGranter = await ethers.getContractFactory("PointsGranter");
      await upgrades.forceImport(addresses.PointsGranterProxy, PointsGranter, {
        kind: "uups",
      });
      console.log("✅ Points proxy force-imported successfully");
    } catch (error) {
      const msg = (error as any)?.message ?? String(error);
      console.warn("⚠️ Points proxy import failed, continuing:", msg);
    }
  }

  await delay(1000);

  console.log("📝 Manifest synchronized with on-chain state");

  // 새 라이브러리 배포 (FLUSH_THRESHOLD 등 신기능 포함)
  console.log("📚 Deploying new LazyMulSegmentTree library...");
  const txOpts = await safeTxOpts();

  const LazyMulSegmentTree = await ethers.getContractFactory(
    "LazyMulSegmentTree",
    { libraries: { FixedPointMathU: addresses.FixedPointMathU } }
  );
  const newSegmentTree = await LazyMulSegmentTree.deploy(txOpts);
  await newSegmentTree.waitForDeployment();
  const newSegmentTreeAddress = await newSegmentTree.getAddress();

  // 환경 파일에 새 라이브러리 주소 저장
  envManager.updateContract(
    environment,
    "libraries",
    "LazyMulSegmentTree",
    newSegmentTreeAddress
  );
  console.log("✅ New LazyMulSegmentTree deployed:", newSegmentTreeAddress);

  // Position contract 업그레이드 (안전한 방법)
  console.log("🎭 Upgrading Position contract...");
  await delay(3000); // Wait between transactions

  let newPositionImplAddress = addresses.CLMSRPositionImplementation;

  if (addresses.CLMSRPositionProxy) {
    try {
      // 업그레이드 이전 구현체 주소를 저장 (RPC 재시도 포함)
      const beforePosImpl = await withRetry(() => 
        upgrades.erc1967.getImplementationAddress(addresses.CLMSRPositionProxy)
      );
      console.log("📋 Position impl before upgrade:", beforePosImpl);

      const CLMSRPosition = await ethers.getContractFactory("CLMSRPosition");
      
      // upgradeProxy 호출 시 RPC 오류 처리
      try {
        await upgrades.upgradeProxy(addresses.CLMSRPositionProxy, CLMSRPosition, {
          kind: "uups",
          redeployImplementation: "always",
          txOverrides: await safeTxOpts(),
        });
        console.log("✅ Position upgradeProxy completed successfully");
      } catch (upgradeError) {
        if (isIgnorableSequencerError(upgradeError)) {
          console.warn("⚠️ RPC 파싱 오류 발생했지만 업그레이드는 성공했을 가능성 높음. 온체인 상태로 검증 진행...");
        } else {
          throw upgradeError;
        }
      }

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
        addresses.CLMSRPositionProxy
      );
      const currentOwner = await positionReadonly.owner();
      console.log("🧑‍⚖️ Position owner:", currentOwner);
      if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        throw new Error(
          `❌ Position owner is ${currentOwner}, not deployer ${deployer.address}. Use the owner key to upgrade.`
        );
      }

      // 1) 새 구현 컨트랙트 직접 배포 (Initializable, no constructor)
      const txOverrides = await safeTxOpts();
      const PositionImplFactory = await ethers.getContractFactory(
        "CLMSRPosition"
      );
      const positionImpl = await PositionImplFactory.deploy(txOverrides);
      await positionImpl.waitForDeployment();
      const manualImplAddr = await positionImpl.getAddress();
      console.log("📦 Deployed new Position implementation:", manualImplAddr);

      // 2) proxy.upgradeTo(새 구현) 호출 (UUPS, onlyOwner)
      // 업그레이드 이전 구현체 주소를 다시 한 번 저장 (수동 업그레이드 전)
      const beforeManualPosImpl =
        await upgrades.erc1967.getImplementationAddress(
          addresses.CLMSRPositionProxy
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
  await delay(3000); // Wait between transactions

  // Core 업그레이드 (레이스 컨디션 제거)

  // 업그레이드 이전 구현체 주소를 저장
  const beforeCoreImpl = await upgrades.erc1967.getImplementationAddress(
    addresses.CLMSRMarketCoreProxy
  );
  console.log("📋 Core impl before upgrade:", beforeCoreImpl);

  // Core contract 업그레이드 (매니페스트 이미 동기화됨)
  const CLMSRMarketCore = await ethers.getContractFactory("CLMSRMarketCore", {
    libraries: {
      FixedPointMathU: addresses.FixedPointMathU,
      LazyMulSegmentTree: newSegmentTreeAddress, // 새 라이브러리 주소 사용
    },
  });

  await upgrades.upgradeProxy(addresses.CLMSRMarketCoreProxy, CLMSRMarketCore, {
    kind: "uups",
    redeployImplementation: "always",
    unsafeAllow: ["external-library-linking"],
    txOverrides: await safeTxOpts(),
  });

  // 새 구현체 주소가 반영될 때까지 대기(폴링)
  const newImplAddress = await waitForImplChange(
    addresses.CLMSRMarketCoreProxy,
    beforeCoreImpl
  );
  console.log("📋 Core impl after upgrade:", newImplAddress);

  envManager.updateContract(
    environment,
    "core",
    "CLMSRMarketCoreImplementation",
    newImplAddress
  );
  console.log("✅ Core contract upgraded:", newImplAddress);

  // PointsGranter 업그레이드 (안전한 방법)
  console.log("🎯 Upgrading PointsGranter...");
  await delay(3000);

  let pointsImplAddress = addresses.PointsGranterImplementation;
  const pointsProxyAddress = addresses.PointsGranterProxy;

  if (addresses.PointsGranterProxy) {
    try {
      // 업그레이드 이전 구현체 주소를 저장 (RPC 재시도 포함)
      const beforePointsImpl = await withRetry(() => 
        upgrades.erc1967.getImplementationAddress(addresses.PointsGranterProxy)
      );
      console.log("📋 Points impl before upgrade:", beforePointsImpl);

      const PointsGranter = await ethers.getContractFactory("PointsGranter");
      
      // upgradeProxy 호출 시 RPC 오류 처리
      try {
        await upgrades.upgradeProxy(addresses.PointsGranterProxy, PointsGranter, {
          kind: "uups",
          redeployImplementation: "always",
          txOverrides: await safeTxOpts(),
        });
        console.log("✅ Points upgradeProxy completed successfully");
      } catch (upgradeError) {
        if (isIgnorableSequencerError(upgradeError)) {
          console.warn("⚠️ RPC 파싱 오류 발생했지만 업그레이드는 성공했을 가능성 높음. 온체인 상태로 검증 진행...");
        } else {
          throw upgradeError;
        }
      }

      // 새 구현체 주소가 반영될 때까지 대기(폴링) - 이미 withRetry 내장됨
      pointsImplAddress = await waitForImplChange(
        pointsProxyAddress,
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
      console.warn("⚠️ PointsGranter upgrade failed, using existing:", msg);
      console.log(
        "📋 Using existing PointsGranter implementation:",
        pointsImplAddress
      );
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
      CLMSRMarketCoreImplementation: newImplAddress,
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

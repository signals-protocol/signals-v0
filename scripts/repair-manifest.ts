import { ethers } from "hardhat";
import { envManager } from "./utils/environment";
import type { Environment } from "./types/environment";
import { OpenZeppelinManifestManager } from "./manage-manifest";
import fs from "fs";
import path from "path";

/**
 * 매니페스트에서 체인에 실제로 존재하지 않는 "유령 구현체"를 청소하는 스크립트
 *
 * 이 스크립트는 OpenZeppelin 매니페스트의 impls 항목들을 순회하며,
 * 각 구현체 주소가 실제로 체인에 배포된 코드를 가지고 있는지 확인합니다.
 * 코드가 없는 주소("0x"를 반환)는 매니페스트에서 제거합니다.
 */

interface ManifestImpl {
  address: string;
  layout: any;
  allAddresses?: string[];
}

interface Manifest {
  manifestVersion: string;
  proxies: Array<{
    address: string;
    kind: string;
  }>;
  impls: Record<string, ManifestImpl>;
}

async function checkCodeAtAddress(address: string): Promise<boolean> {
  try {
    const code = await ethers.provider.getCode(address);
    return code !== "0x";
  } catch (error) {
    console.warn(`⚠️ Error checking code at ${address}:`, error);
    return false;
  }
}

async function cleanGhostImplementations(
  environment: Environment
): Promise<void> {
  console.log(`🧹 Cleaning ghost implementations for ${environment}...`);

  const manifestManager = new OpenZeppelinManifestManager();

  // 매니페스트 백업
  console.log("💾 Creating backup before cleanup...");
  await manifestManager.backup(environment);

  // 매니페스트 파일 경로 결정
  const manifestDir =
    environment === "localhost"
      ? ".openzeppelin"
      : `.openzeppelin/${environment === "citrea-dev" ? "dev" : "prod"}`;

  const manifestPath = path.join(
    process.cwd(),
    manifestDir,
    "unknown-5115.json"
  );

  if (!fs.existsSync(manifestPath)) {
    console.log(`❌ Manifest file not found: ${manifestPath}`);
    return;
  }

  // 매니페스트 읽기
  const manifestContent = fs.readFileSync(manifestPath, "utf8");
  const manifest: Manifest = JSON.parse(manifestContent);

  console.log(
    `📋 Found ${
      Object.keys(manifest.impls || {}).length
    } implementation entries in manifest`
  );

  const validImpls: string[] = [];
  const removed: string[] = [];
  const promoted: string[] = [];

  // 각 구현체와 allAddresses 확인
  for (const [implId, impl] of Object.entries(manifest.impls || {})) {
    console.log(`🔍 Checking implementation entry: ${implId}`);
    
    // 주소 목록 수집 (address + allAddresses)
    const candidates = Array.from(new Set([
      impl.address?.toLowerCase(),
      ...(impl.allAddresses?.map(a => a.toLowerCase()) ?? [])
    ].filter(Boolean)));
    
    const validAddrs: string[] = [];
    
    for (const addr of candidates) {
      console.log(`  📍 Checking address: ${addr}...`);
      const hasCode = await checkCodeAtAddress(addr);
      
      if (hasCode) {
        console.log(`  ✅ Valid: ${addr}`);
        validAddrs.push(addr);
        validImpls.push(addr);
      } else {
        console.log(`  👻 Ghost: ${addr} (no code)`);
        removed.push(addr);
      }
      
      // 요청 간 지연을 추가하여 RPC 제한 방지
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    
    if (validAddrs.length === 0) {
      console.log(`🗑️ Removing completely invalid implementation: ${implId}`);
      delete manifest.impls[implId];
    } else {
      // 가장 최근(마지막) 유효 주소를 대표 address로 설정
      const current = validAddrs[validAddrs.length - 1];
      if (!impl.address || impl.address.toLowerCase() !== current.toLowerCase()) {
        promoted.push(`${impl.address} -> ${current}`);
        impl.address = current;
      }
      impl.allAddresses = validAddrs.filter(a => a.toLowerCase() !== current.toLowerCase());
      console.log(`🔧 Updated impl: primary=${impl.address}, history=${impl.allAddresses.length}`);
    }
  }

  // 동일 주소/컴파일 버전 조합 중복 제거
  const seen = new Set<string>();
  for (const [implId, impl] of Object.entries(manifest.impls || {})) {
    const key = `${impl.address?.toLowerCase()}-${impl.layout?.solcVersion ?? ""}`;
    if (seen.has(key)) {
      console.log(`🔄 Removing duplicate impl: ${implId}`);
      delete manifest.impls[implId];
    } else {
      seen.add(key);
    }
  }

  // 결과 요약
  console.log(`\n📊 Cleanup Summary:`);
  console.log(`   ✅ Valid implementations: ${validImpls.length}`);
  console.log(`   👟 Promoted addresses: ${promoted.length}`);
  console.log(`   🗑️ Removed ghost addresses (including allAddresses): ${removed.length}`);

  if (removed.length > 0 || promoted.length > 0) {
    if (removed.length > 0) {
      console.log(`\n🗑️ Removed ghost addresses:`);
      removed.forEach(addr => console.log(`   - ${addr}`));
    }
    
    if (promoted.length > 0) {
      console.log(`\n👟 Promoted addresses:`);
      promoted.forEach(change => console.log(`   - ${change}`));
    }

    // 수정된 매니페스트 저장
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\n💾 Updated manifest saved: ${manifestPath}`);
  } else {
    console.log(`\n🎉 No ghost implementations found. Manifest is clean!`);
  }
}

async function repairManifestAction(environment: Environment): Promise<void> {
  console.log(`🔧 Starting manifest repair for ${environment}...`);

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  try {
    await cleanGhostImplementations(environment);
    console.log(
      `\n✅ Manifest repair completed successfully for ${environment}!`
    );
  } catch (error) {
    console.error(`❌ Manifest repair failed:`, error);
    throw error;
  }
}

export { repairManifestAction, cleanGhostImplementations };

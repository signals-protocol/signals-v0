import { ethers } from "hardhat";
import { parseUnits } from "ethers";
import * as fs from "fs";

function getLatestDeployment() {
  try {
    // deployments 디렉토리에서 최신 배포 파일 찾기
    const deploymentsDir = "./deployments";
    if (!fs.existsSync(deploymentsDir)) {
      console.error("❌ deployments 디렉토리를 찾을 수 없습니다.");
      process.exit(1);
    }

    const files = fs
      .readdirSync(deploymentsDir)
      .filter(
        (file) => file.startsWith("deployment-") && file.endsWith(".json")
      )
      .sort()
      .reverse(); // 최신 파일을 위에 오도록 정렬

    if (files.length === 0) {
      console.error("❌ 배포 파일을 찾을 수 없습니다.");
      console.log("먼저 deploy.ts를 실행해주세요.");
      process.exit(1);
    }

    const latestFile = files[0];
    const deployment = JSON.parse(
      fs.readFileSync(`${deploymentsDir}/${latestFile}`, "utf-8")
    );

    console.log("📁 사용 중인 배포 파일:", latestFile);
    return deployment;
  } catch (error) {
    console.error("❌ 배포 주소 읽기 실패:", error);
    process.exit(1);
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("🚀 마켓 자금 조달 시작");
  console.log("👤 송금 계정:", signer.address);

  // 배포된 컨트랙트 주소 가져오기
  const deployment = getLatestDeployment();
  const coreAddress = deployment.contracts.CLMSRMarketCore;
  const susdAddress = deployment.contracts.SUSD;

  console.log("🎯 Core 컨트랙트:", coreAddress);
  console.log("💰 SUSD 토큰:", susdAddress);

  // SUSD 컨트랙트 연결
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const susdToken = MockERC20Factory.attach(susdAddress);

  // 현재 잔액 확인
  const balance = await susdToken.balanceOf(signer.address);
  console.log("💰 현재 SUSD 잔액:", ethers.formatUnits(balance, 6), "SUSD");

  // CLMSR 최대 손실 계산: α × ln(N)
  const alpha = 1000; // 1000 USDC (decimal 6)
  const N = 400; // 틱 개수
  const requiredFunding = Math.ceil(alpha * Math.log(N)); // 5991 USDC

  console.log("📊 마켓 4 자금 요구사항:");
  console.log("  - α (liquidity parameter):", alpha, "USDC");
  console.log("  - N (number of ticks):", N);
  console.log("  - 최대 손실 (α × ln(N)):", requiredFunding, "USDC");

  const fundingAmount = parseUnits(requiredFunding.toString(), 6);

  // 잔액 확인
  if (balance < fundingAmount) {
    console.error("❌ SUSD 잔액이 부족합니다!");
    console.log("필요:", ethers.formatUnits(fundingAmount, 6), "SUSD");
    console.log("보유:", ethers.formatUnits(balance, 6), "SUSD");

    // 추가 발행
    console.log("💵 SUSD 추가 발행 중...");
    const mintAmount = fundingAmount - balance + parseUnits("1000", 6); // 여유분 1000 SUSD
    const mintTx = await susdToken.mint(signer.address, mintAmount);
    await mintTx.wait();
    console.log(
      "✅ SUSD 발행 완료:",
      ethers.formatUnits(mintAmount, 6),
      "SUSD"
    );
  }

  // Core 컨트랙트로 SUSD 송금
  console.log("📤 Core 컨트랙트로 SUSD 송금 중...");
  const transferTx = await susdToken.transfer(coreAddress, fundingAmount);
  await transferTx.wait();
  console.log("✅ 송금 완료:", transferTx.hash);

  // 결과 확인
  const coreBalance = await susdToken.balanceOf(coreAddress);
  console.log(
    "🎉 Core 컨트랙트 SUSD 잔액:",
    ethers.formatUnits(coreBalance, 6),
    "SUSD"
  );

  console.log("\n✅ 마켓 4 자금 조달 완료!");
  console.log("이제 트레이딩이 가능합니다.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 실행 중 오류:", error);
    process.exit(1);
  });

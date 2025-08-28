import { ethers } from "hardhat";
import { parseUnits } from "ethers";

/**
 * Citrea Prod 환경에 천만 달러 (10M SUSD) 전송 스크립트
 */

const CITREA_PROD_CONFIG = {
  network: "citrea-prod",
  chainId: 5115,
  marketCoreAddress: "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
  susdAddress: "0xE32527F8b3f142a69278f22CdA334d70644b9743",
  fundAmount: "10000000", // 10M SUSD
  gasEthAmount: "0.005", // 0.005 ETH for gas fees
};

async function main() {
  console.log("🚀 Citrea Prod 자금 전송 시작");

  const [signer] = await ethers.getSigners();
  console.log("👤 송금자 계정:", signer.address);

  // 네트워크 확인
  const network = await ethers.provider.getNetwork();
  console.log(
    "🌐 현재 네트워크:",
    network.name,
    "- Chain ID:",
    Number(network.chainId)
  );

  if (Number(network.chainId) !== CITREA_PROD_CONFIG.chainId) {
    throw new Error(
      `❌ 네트워크 불일치: 현재 ${network.chainId}, 필요 ${CITREA_PROD_CONFIG.chainId} (citrea-prod)`
    );
  }

  // 현재 계정 잔액 확인
  const ethBalance = await ethers.provider.getBalance(signer.address);
  console.log("💰 현재 ETH 잔액:", ethers.formatEther(ethBalance));

  // SUSD 컨트랙트 연결
  console.log("🔗 SUSD 컨트랙트 연결 중...");
  const susdContract = await ethers.getContractAt(
    "MockERC20",
    CITREA_PROD_CONFIG.susdAddress
  );

  // SUSD 잔액 확인
  const susdBalance = await susdContract.balanceOf(signer.address);
  const susdBalanceFormatted = ethers.formatUnits(susdBalance, 6);
  console.log("💰 현재 SUSD 잔액:", susdBalanceFormatted, "SUSD");

  const requiredSusd = parseUnits(CITREA_PROD_CONFIG.fundAmount, 6);

  // 필요한 잔액 체크
  if (susdBalance < requiredSusd) {
    console.log("⚠️  SUSD 잔액이 부족합니다!");
    console.log("필요:", CITREA_PROD_CONFIG.fundAmount, "SUSD");
    console.log("보유:", susdBalanceFormatted, "SUSD");

    // SUSD 발행 시도
    console.log("💰 SUSD 발행 시도 중...");
    try {
      const mintAmount = requiredSusd - susdBalance;
      const mintTx = await susdContract.mint(signer.address, mintAmount);
      await mintTx.wait();
      console.log(
        "✅ SUSD 발행 완료:",
        ethers.formatUnits(mintAmount, 6),
        "SUSD"
      );

      const newBalance = await susdContract.balanceOf(signer.address);
      console.log(
        "📊 새로운 SUSD 잔액:",
        ethers.formatUnits(newBalance, 6),
        "SUSD"
      );
    } catch (error) {
      console.error("❌ SUSD 발행 실패:", error);
      console.log("💡 수동으로 SUSD를 발행하거나 다른 계정에서 전송받으세요.");
      return;
    }
  }

  // Market Core 주소로 자금 전송
  console.log("📤 자금 전송 시작...");
  console.log("🎯 대상 주소:", CITREA_PROD_CONFIG.marketCoreAddress);
  console.log("💵 전송 금액:", CITREA_PROD_CONFIG.fundAmount, "SUSD");

  try {
    // SUSD 전송 (ETH는 제외 - 가스비 부족)
    console.log("💵 SUSD 전송 중...");
    const susdTx = await susdContract.transfer(
      CITREA_PROD_CONFIG.marketCoreAddress,
      requiredSusd
    );
    await susdTx.wait();
    console.log("✅ SUSD 전송 완료:", susdTx.hash);
    console.log("   전송 금액:", CITREA_PROD_CONFIG.fundAmount, "SUSD");

    // 전송 후 잔액 확인
    console.log("\n📊 전송 후 잔액 확인:");
    const finalEthBalance = await ethers.provider.getBalance(signer.address);
    const finalSusdBalance = await susdContract.balanceOf(signer.address);
    const targetEthBalance = await ethers.provider.getBalance(
      CITREA_PROD_CONFIG.marketCoreAddress
    );
    const targetSusdBalance = await susdContract.balanceOf(
      CITREA_PROD_CONFIG.marketCoreAddress
    );

    console.log("👤 송금자 잔액:");
    console.log("   ETH:", ethers.formatEther(finalEthBalance));
    console.log("   SUSD:", ethers.formatUnits(finalSusdBalance, 6));

    console.log("🎯 대상 계정 잔액:");
    console.log("   ETH:", ethers.formatEther(targetEthBalance));
    console.log("   SUSD:", ethers.formatUnits(targetSusdBalance, 6));

    console.log("\n🎉 Citrea Prod 자금 전송 완료!");
    console.log("📋 요약:");
    console.log("   네트워크: Citrea Testnet (Chain ID: 5115)");
    console.log(
      "   대상: CLMSRMarketCore (",
      CITREA_PROD_CONFIG.marketCoreAddress,
      ")"
    );
    console.log(
      "   SUSD 전송:",
      CITREA_PROD_CONFIG.fundAmount,
      "SUSD ($10,000,000)"
    );
    console.log("   SUSD TX:", susdTx.hash);
  } catch (error) {
    console.error("❌ 자금 전송 실패:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

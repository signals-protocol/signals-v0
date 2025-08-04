import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("현재 계정:", signer.address);

  // 최신 배포에서 SUSD 주소 가져오기
  const deploymentData = require("../deployments/deployment-8453-1754335067399.json");
  const susdAddress = deploymentData.contracts.SUSD;

  console.log("SUSD 주소:", susdAddress);

  const susd = await ethers.getContractAt("MockERC20", susdAddress);
  const balance = await susd.balanceOf(signer.address);
  console.log("현재 SUSD 잔액:", ethers.formatUnits(balance, 6), "SUSD");

  if (balance < ethers.parseUnits("100000", 6)) {
    console.log("💰 SUSD 발행 중...");
    const mintAmount = ethers.parseUnits("1000000", 6);
    const tx = await susd.mint(signer.address, mintAmount);
    await tx.wait();
    console.log(
      "✅ SUSD 발행 완료:",
      ethers.formatUnits(mintAmount, 6),
      "SUSD"
    );

    const newBalance = await susd.balanceOf(signer.address);
    console.log("새로운 잔액:", ethers.formatUnits(newBalance, 6), "SUSD");
  } else {
    console.log("✅ 충분한 SUSD 잔액이 있습니다.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

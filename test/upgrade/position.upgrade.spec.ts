import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC721_METADATA_INTERFACE_ID = "0x5b5e139f";

type PositionTokenSnapshot = {
  tokenId: string;
  owner: string;
  tokenURI: string;
  position: {
    marketId: string;
    lowerTick: string;
    upperTick: string;
    quantity: string;
    createdAt: string;
  };
};

type OwnerSnapshot = {
  balance: string;
  tokenIds: string[];
};

type MarketSnapshot = {
  tokens: string[];
};

type PositionSnapshot = {
  core: string;
  owner: string;
  name: string;
  symbol: string;
  supportsERC721: boolean;
  supportsMetadata: boolean;
  tokens: PositionTokenSnapshot[];
  owners: Record<string, OwnerSnapshot>;
  markets: Record<string, MarketSnapshot>;
};

interface SnapshotOptions {
  tokenIds: bigint[];
  owners: string[];
  marketIds: bigint[];
}

async function capturePositionSnapshot(
  position: any,
  options: SnapshotOptions
): Promise<PositionSnapshot> {
  const { tokenIds, owners, marketIds } = options;

  const [core, contractOwner, name, symbol, supportsERC721, supportsMetadata] =
    await Promise.all([
      position.core(),
      position.owner(),
      position.name(),
      position.symbol(),
      position.supportsInterface(ERC721_INTERFACE_ID),
      position.supportsInterface(ERC721_METADATA_INTERFACE_ID),
    ]);

  const tokens: PositionTokenSnapshot[] = [];
  for (const tokenId of tokenIds) {
    const [tokenOwner, tokenURI, positionData] = await Promise.all([
      position.ownerOf(tokenId),
      position.tokenURI(tokenId),
      position.getPosition(tokenId),
    ]);

    tokens.push({
      tokenId: tokenId.toString(),
      owner: tokenOwner,
      tokenURI,
      position: {
        marketId: positionData.marketId.toString(),
        lowerTick: positionData.lowerTick.toString(),
        upperTick: positionData.upperTick.toString(),
        quantity: positionData.quantity.toString(),
        createdAt: positionData.createdAt.toString(),
      },
    });
  }

  const ownersSnapshot: Record<string, OwnerSnapshot> = {};
  for (const ownerAddress of owners) {
    const balance: bigint = await position.balanceOf(ownerAddress);
    const ownedTokenIds = tokens
      .filter((tokenSnapshot) => tokenSnapshot.owner === ownerAddress)
      .map((tokenSnapshot) => tokenSnapshot.tokenId);

    ownersSnapshot[ownerAddress] = {
      balance: balance.toString(),
      tokenIds: ownedTokenIds,
    };
  }

  const marketsSnapshot: Record<string, MarketSnapshot> = {};
  for (const marketId of marketIds) {
    const length: bigint = await position.getMarketTokenLength(marketId);
    const tokensInMarket: string[] = [];

    for (let i = 0n; i < length; i++) {
      const tokenId: bigint = await position.getMarketTokenAt(marketId, i);
      tokensInMarket.push(tokenId.toString());
    }

    marketsSnapshot[marketId.toString()] = {
      tokens: tokensInMarket,
    };
  }

  return {
    core,
    owner: contractOwner,
    name,
    symbol,
    supportsERC721,
    supportsMetadata,
    tokens,
    owners: ownersSnapshot,
    markets: marketsSnapshot,
  };
}

async function deployPositionProxyFixture() {
  const [deployer, keeper, alice, bob, charlie] = await ethers.getSigners();

  const PositionFactory = await ethers.getContractFactory("CLMSRPosition");
  const position = await upgrades.deployProxy(
    PositionFactory,
    [deployer.address],
    {
      kind: "uups",
      initializer: "initialize",
    }
  );
  await position.waitForDeployment();

  await position.transferOwnership(keeper.address);

  return {
    deployer,
    keeper,
    alice,
    bob,
    charlie,
    position,
  };
}

async function mintPosition(
  position: any,
  coreSigner: any,
  to: string,
  params: {
    marketId: bigint;
    lowerTick: number;
    upperTick: number;
    quantity: bigint;
  }
): Promise<bigint> {
  const { marketId, lowerTick, upperTick, quantity } = params;
  const positionId = await position
    .connect(coreSigner)
    .mintPosition.staticCall(to, marketId, lowerTick, upperTick, quantity);

  await position
    .connect(coreSigner)
    .mintPosition(to, marketId, lowerTick, upperTick, quantity);

  return positionId;
}

describe("[upgrade] CLMSRPosition UUPS 업그레이드", function () {
  it("업그레이드 이후에도 포지션 상태가 유지되어야 한다", async function () {
    const fixtures = await loadFixture(deployPositionProxyFixture);
    const { position, deployer, keeper, alice, bob } = fixtures;

    const quantityOne = ethers.parseUnits("0.01", 6);
    const updatedQuantityOne = ethers.parseUnits("0.015", 6);
    const quantityTwo = ethers.parseUnits("0.025", 6);

    const marketOne = 11n;
    const marketTwo = 22n;

    const positionIdOne = await mintPosition(position, deployer, alice.address, {
      marketId: marketOne,
      lowerTick: 100100,
      upperTick: 100200,
      quantity: quantityOne,
    });

    await position
      .connect(deployer)
      .updateQuantity(positionIdOne, updatedQuantityOne);

    const positionIdTwo = await mintPosition(position, deployer, bob.address, {
      marketId: marketTwo,
      lowerTick: 100300,
      upperTick: 100400,
      quantity: quantityTwo,
    });

    const preSnapshot = await capturePositionSnapshot(position, {
      tokenIds: [positionIdOne, positionIdTwo],
      owners: [alice.address, bob.address],
      marketIds: [marketOne, marketTwo],
    });

    const PositionV2Factory = await ethers.getContractFactory(
      "CLMSRPositionV2Mock"
    );
    const implementation = await PositionV2Factory.deploy();
    await implementation.waitForDeployment();

    await expect(
      position
        .connect(keeper)
        .upgradeToAndCall(await implementation.getAddress(), "0x")
    )
      .to.emit(position, "Upgraded")
      .withArgs(await implementation.getAddress());

    const upgraded = await ethers.getContractAt(
      "CLMSRPositionV2Mock",
      await position.getAddress()
    );

    expect(await upgraded.version()).to.equal("position-v2-mock");

    const postSnapshot = await capturePositionSnapshot(upgraded, {
      tokenIds: [positionIdOne, positionIdTwo],
      owners: [alice.address, bob.address],
      marketIds: [marketOne, marketTwo],
    });

    expect(postSnapshot).to.deep.equal(preSnapshot);

    const additionalQuantity = ethers.parseUnits("0.005", 6);
    const newMarketId = 33n;

    const positionIdThree = await upgraded
      .connect(deployer)
      .mintPosition.staticCall(
        alice.address,
        newMarketId,
        100500,
        100600,
        additionalQuantity
      );

    await upgraded
      .connect(deployer)
      .mintPosition(
        alice.address,
        newMarketId,
        100500,
        100600,
        additionalQuantity
      );

    expect(positionIdThree).to.equal(positionIdTwo + 1n);
    expect(await upgraded.balanceOf(alice.address)).to.equal(2n);

    const reducedQuantity = updatedQuantityOne - additionalQuantity;
    await upgraded
      .connect(deployer)
      .updateQuantity(positionIdOne, reducedQuantity);

    const positionAfterUpdate = await upgraded.getPosition(positionIdOne);
    expect(positionAfterUpdate.quantity).to.equal(reducedQuantity);

    expect(await upgraded.ownerOf(positionIdOne)).to.equal(alice.address);
    expect(await upgraded.ownerOf(positionIdThree)).to.equal(alice.address);

    await expect(
      upgraded.connect(deployer).burn(positionIdTwo)
    ).to.not.be.reverted;

    await expect(
      upgraded.ownerOf(positionIdTwo)
    ).to.be.revertedWithCustomError(upgraded, "ERC721NonexistentToken");
    await expect(
      upgraded.getPosition(positionIdTwo)
    ).to.be.revertedWithCustomError(upgraded, "PositionNotFound");
  });
});

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../managers/CLMSRMarketManager.sol";

/// @dev Test-only manager that allows Hardhat local signers (chainid 31337) as authorised RedStone signers.
contract CLMSRMarketManagerTest is CLMSRMarketManager {
    address private constant LOCAL_SIGNER_0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address private constant LOCAL_SIGNER_1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address private constant LOCAL_SIGNER_2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;

    function getAuthorisedSignerIndex(address signerAddress)
        public
        view
        override
        returns (uint8)
    {
        if (block.chainid == 31337) {
            if (signerAddress == LOCAL_SIGNER_0) return 0;
            if (signerAddress == LOCAL_SIGNER_1) return 1;
            if (signerAddress == LOCAL_SIGNER_2) return 2;
            revert SignerNotAuthorised(signerAddress);
        }
        return super.getAuthorisedSignerIndex(signerAddress);
    }

    function getUniqueSignersThreshold() public view override returns (uint8) {
        if (block.chainid == 31337) {
            return 3;
        }
        return super.getUniqueSignersThreshold();
    }
}

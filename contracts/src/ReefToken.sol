// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ReefToken
 * @notice ERC20 token for The Reef knowledge base protocol
 * @dev Minting restricted to the ReefRegistry contract for citation rewards
 *
 * Initial Distribution (1B total):
 * - 65% Citation rewards pool (held by registry)
 * - 25% Protocol treasury
 * - 10% Airdrop to early agents
 *
 * Security:
 * - setRegistry is owner-only to prevent front-running
 * - One-time registry setting (immutable after set)
 */
contract ReefToken is ERC20, Ownable {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10**18;

    uint256 public constant REWARDS_POOL_BPS = 6500;   // 65%
    uint256 public constant TREASURY_BPS = 2500;       // 25%
    uint256 public constant AIRDROP_BPS = 1000;        // 10%

    address public registry;
    address public immutable treasury;

    error OnlyRegistry();
    error RegistryAlreadySet();
    error ZeroAddress();

    modifier onlyRegistry() {
        if (msg.sender != registry) revert OnlyRegistry();
        _;
    }

    constructor(
        address _treasury,
        address _airdropRecipient
    ) ERC20("Reef Token", "REEF") Ownable(msg.sender) {
        if (_treasury == address(0) || _airdropRecipient == address(0)) {
            revert ZeroAddress();
        }

        treasury = _treasury;

        // Mint treasury allocation (25%)
        uint256 treasuryAmount = (INITIAL_SUPPLY * TREASURY_BPS) / 10000;
        _mint(_treasury, treasuryAmount);

        // Mint airdrop allocation (10%)
        uint256 airdropAmount = (INITIAL_SUPPLY * AIRDROP_BPS) / 10000;
        _mint(_airdropRecipient, airdropAmount);
    }

    /**
     * @notice Set the registry address and mint rewards pool (one-time only)
     * @dev SECURITY: Owner-only to prevent front-running attacks
     * @param _registry The ReefRegistry contract address
     */
    function setRegistry(address _registry) external onlyOwner {
        if (registry != address(0)) revert RegistryAlreadySet();
        if (_registry == address(0)) revert ZeroAddress();

        registry = _registry;

        // Mint rewards pool to registry (65%)
        uint256 rewardsAmount = (INITIAL_SUPPLY * REWARDS_POOL_BPS) / 10000;
        _mint(_registry, rewardsAmount);
    }
}

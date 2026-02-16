// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DepositVault is AccessControl, ReentrancyGuard {
    bytes32 public constant LOGIC_ROLE = keccak256("LOGIC_ROLE");
    bytes32 public constant WITHDRAWAL_ROLE = keccak256("WITHDRAWAL_ROLE");

    mapping(address => uint256) public userBalances;

    event Deposited(address indexed user, uint256 amount);
    event BalanceAdjusted(address indexed user, int256 delta, uint256 newBalance);
    event FundsWithdrawn(address indexed user, uint256 amount);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Users deposit ETH into the vault to fund their game balance
    function deposit() external payable nonReentrant {
        require(msg.value > 0, "Deposit amount must be > 0");
        userBalances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Restricted function for GameLogic to adjust balances based on game outcomes
    function modifyBalance(address user, int256 delta) external onlyRole(LOGIC_ROLE) {
        if (delta > 0) {
            userBalances[user] += uint256(delta);
        } else {
            uint256 absDelta = uint256(-delta);
            require(userBalances[user] >= absDelta, "Insufficient balance for deduction");
            userBalances[user] -= absDelta;
        }
        emit BalanceAdjusted(user, delta, userBalances[user]);
    }

    /// @notice Restricted function for WithdrawalPortal to execute ETH transfers
    function executeTransfer(address to, uint256 amount) external onlyRole(WITHDRAWAL_ROLE) nonReentrant {
        require(userBalances[to] >= amount, "Vault: Insufficient user balance");
        userBalances[to] -= amount;
        
        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "Vault: ETH transfer failed");
        
        emit FundsWithdrawn(to, amount);
    }

    receive() external payable {
        userBalances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }
}

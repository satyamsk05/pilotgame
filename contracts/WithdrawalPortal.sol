// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDepositVault {
    function userBalances(address) external view returns (uint256);
    function executeTransfer(address to, uint256 amount) external;
}

contract WithdrawalPortal {
    IDepositVault public depositVault;

    event WithdrawalRequested(address indexed user, uint256 amount);

    constructor(address _depositVault) {
        depositVault = IDepositVault(_depositVault);
    }

    function withdraw(uint256 _amount) external {
        uint256 balance = depositVault.userBalances(msg.sender);
        require(balance >= _amount, "WithdrawalPortal: Insufficient balance");
        
        emit WithdrawalRequested(msg.sender, _amount);
        
        // This will revert if WithdrawalPortal doesn't have WITHDRAWAL_ROLE in DepositVault
        depositVault.executeTransfer(msg.sender, _amount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IDepositVault {
    function modifyBalance(address user, int256 delta) external;
}

contract GameLogic is Ownable {
    IDepositVault public depositVault;
    uint256 public currentRoundId;

    struct Round {
        bytes32 commitment;
        uint256 crashPoint;
        bool finalized;
    }

    mapping(uint256 => Round) public rounds;

    event RoundStarted(uint256 indexed roundId, bytes32 commitment);
    event RoundFinalized(uint256 indexed roundId, uint256 crashPoint);

    constructor(address _depositVault) Ownable(msg.sender) {
        depositVault = IDepositVault(_depositVault);
    }

    function setDepositVault(address _depositVault) external onlyOwner {
        depositVault = IDepositVault(_depositVault);
    }

    function startNewRound(bytes32 _commitment) external onlyOwner {
        currentRoundId++;
        rounds[currentRoundId] = Round({
            commitment: _commitment,
            crashPoint: 0,
            finalized: false
        });
        emit RoundStarted(currentRoundId, _commitment);
    }

    function finalizeRound(uint256 _crashPoint, string memory _salt) external onlyOwner {
        require(!rounds[currentRoundId].finalized, "Round already finalized");
        // Verification of commitment could be added here
        rounds[currentRoundId].crashPoint = _crashPoint;
        rounds[currentRoundId].finalized = true;
        emit RoundFinalized(currentRoundId, _crashPoint);
    }

    /// @notice Settle multiple players in one transaction
    /// @param _players Array of player addresses
    /// @param _netChanges Array of net changes in Wei (positive for win, negative for loss)
    function settleBatch(
        address[] calldata _players,
        int256[] calldata _netChanges
    ) external onlyOwner {
        require(_players.length == _netChanges.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < _players.length; i++) {
            depositVault.modifyBalance(_players[i], _netChanges[i]);
        }
    }
}

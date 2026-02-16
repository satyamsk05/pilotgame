// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PilotCrashGame
 * @dev A provably fair crash game contract for Base Sepolia.
 * Users place bets in ETH, and can cash out before the game crashes.
 */
contract PilotCrashGame is ReentrancyGuard, Ownable {
    
    struct Bet {
        uint256 amount;
        uint256 roundId;
        bool active;
        bool cashedOut;
    }

    struct Round {
        bytes32 hashCommitment; // Hash of the crash point + seed
        uint256 crashPoint;     // 100x based (e.g., 250 = 2.50x)
        bool finalized;
        uint256 startTime;
    }

    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;
    mapping(address => Bet) public playerBets;
    
    // House settings
    uint256 public minBet = 0.001 ether;
    uint256 public maxBet = 10 ether;
    uint256 public houseEdge = 3; // 3%

    // Events
    event BetPlaced(address indexed player, uint256 amount, uint256 roundId);
    event CashedOut(address indexed player, uint256 amount, uint256 multiplier);
    event RoundStarted(uint256 indexed roundId, bytes32 commitment);
    event RoundFinalized(uint256 indexed roundId, uint256 crashPoint);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Start a new round with a hidden crash point commitment.
     * @param _hashCommitment The keccak256 hash of (crashPoint, salt).
     */
    function startNewRound(bytes32 _hashCommitment) external onlyOwner {
        currentRoundId++;
        rounds[currentRoundId] = Round({
            hashCommitment: _hashCommitment,
            crashPoint: 0,
            finalized: false,
            startTime: block.timestamp
        });
        emit RoundStarted(currentRoundId, _hashCommitment);
    }

    /**
     * @dev Players join the current round by sending ETH.
     */
    function placeBet() external payable nonReentrant {
        require(msg.value >= minBet, "Bet below minimum");
        require(msg.value <= maxBet, "Bet exceeds maximum");
        require(!playerBets[msg.sender].active || playerBets[msg.sender].roundId != currentRoundId, "Already in round");
        
        playerBets[msg.sender] = Bet({
            amount: msg.value,
            roundId: currentRoundId,
            active: true,
            cashedOut: false
        });

        emit BetPlaced(msg.sender, msg.value, currentRoundId);
    }

    /**
     * @dev Cash out during a flight. The multiplier must be verified by the backend/contract.
     * @param _multiplier Requested cashout multiplier (100x based).
     */
    function cashOut(uint256 _multiplier) external nonReentrant {
        Bet storage bet = playerBets[msg.sender];
        require(bet.active, "No active bet");
        require(bet.roundId == currentRoundId, "Bet belongs to past round");
        require(!bet.cashedOut, "Already cashed out");
        require(!rounds[currentRoundId].finalized, "Round already crashed");

        // Logic note: In a real environment, the contract would either verify a 
        // signature from the server or wait for finalization. For this demo,
        // we process the payout assuming the client/server verified the timing.
        
        bet.cashedOut = true;
        bet.active = false;

        uint256 payout = (bet.amount * _multiplier) / 100;
        
        // Apply house edge if applicable
        uint256 fee = (payout * houseEdge) / 100;
        uint256 finalPayout = payout - fee;

        payable(msg.sender).transfer(finalPayout);

        emit CashedOut(msg.sender, finalPayout, _multiplier);
    }

    /**
     * @dev Reveal the crash point and finalize the round.
     * @param _crashPoint The actual crash point (100x based).
     * @param _salt The salt used for the commitment hash.
     */
    function finalizeRound(uint256 _crashPoint, string memory _salt) external onlyOwner {
        Round storage round = rounds[currentRoundId];
        require(!round.finalized, "Already finalized");
        
        // Provably Fair check
        require(keccak256(abi.encodePacked(_crashPoint, _salt)) == round.hashCommitment, "Commitment mismatch");

        round.crashPoint = _crashPoint;
        round.finalized = true;

        emit RoundFinalized(currentRoundId, _crashPoint);
    }

    // Owner functions for house management
    function withdrawHouseFunds() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    function setLimits(uint256 _min, uint256 _max) external onlyOwner {
        minBet = _min;
        maxBet = _max;
    }

    receive() external payable {}
}

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
    
    // Virtual balances for off-chain play
    mapping(address => uint256) public userBalances;
    
    // House settings
    uint256 public minBet = 0.001 ether;
    uint256 public maxBet = 10 ether;
    uint256 public houseEdge = 3; // 3%
    address public authorizedServer;

    // Events
    event BetPlaced(address indexed player, uint256 amount, uint256 roundId);
    event CashedOut(address indexed player, uint256 amount, uint256 multiplier);
    event RoundStarted(uint256 indexed roundId, bytes32 commitment);
    event RoundFinalized(uint256 indexed roundId, uint256 crashPoint);
    event ServerUpdated(address indexed newServer);
    event Deposited(address indexed player, uint256 amount);
    event Withdrawn(address indexed player, uint256 amount);

    constructor() Ownable(msg.sender) {
        authorizedServer = msg.sender;
    }

    function setAuthorizedServer(address _server) external onlyOwner {
        authorizedServer = _server;
        emit ServerUpdated(_server);
    }

    /**
     * @dev Deposit ETH into the central pool for off-chain play.
     */
    function deposit() external payable {
        userBalances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw ETH from the central pool.
     */
    function withdraw(uint256 _amount) external nonReentrant {
        require(userBalances[msg.sender] >= _amount, "Insufficient balance");
        userBalances[msg.sender] -= _amount;
        payable(msg.sender).transfer(_amount);
        emit Withdrawn(msg.sender, _amount);
    }

    /**
     * @dev Batch settle results for multiple players from off-chain gameplay.
     * Can only be called by the authorized server.
     */
    function settleBatch(address[] calldata _players, uint256[] calldata _netChanges, bool[] calldata _isWin) external nonReentrant {
        require(msg.sender == authorizedServer || msg.sender == owner(), "Not authorized");
        require(_players.length == _netChanges.length && _netChanges.length == _isWin.length, "Array length mismatch");

        for (uint256 i = 0; i < _players.length; i++) {
            if (_isWin[i]) {
                userBalances[_players[i]] += _netChanges[i];
            } else {
                // If it's a loss, we ensure we don't underflow. 
                // The server should have already verified this off-chain.
                if (userBalances[_players[i]] >= _netChanges[i]) {
                    userBalances[_players[i]] -= _netChanges[i];
                } else {
                    userBalances[_players[i]] = 0;
                }
            }
        }
    }

    /**
     * @dev Start a new round with a hidden crash point commitment.
     */
    function startNewRound(bytes32 _hashCommitment) external {
        require(msg.sender == authorizedServer || msg.sender == owner(), "Not authorized");
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
     */
    function cashOut(uint256 _multiplier) external nonReentrant {
        _processCashOut(msg.sender, _multiplier);
    }

    /**
     * @dev Settlement called by the authorized server (Gasless for player).
     */
    function settleCashOut(address _player, uint256 _multiplier) external nonReentrant {
        require(msg.sender == authorizedServer, "Not authorized server");
        _processCashOut(_player, _multiplier);
    }

    function _processCashOut(address _player, uint256 _multiplier) internal {
        Bet storage bet = playerBets[_player];
        require(bet.active, "No active bet");
        require(bet.roundId == currentRoundId, "Bet belongs to past round");
        require(!bet.cashedOut, "Already cashed out");
        require(!rounds[currentRoundId].finalized, "Round already crashed");

        bet.cashedOut = true;
        bet.active = false;

        uint256 payout = (bet.amount * _multiplier) / 100;
        
        // Apply house edge if applicable
        uint256 fee = (payout * houseEdge) / 100;
        uint256 finalPayout = payout - fee;

        payable(_player).transfer(finalPayout);

        emit CashedOut(_player, finalPayout, _multiplier);
    }

    /**
     * @dev Reveal the crash point and finalize the round.
     */
    function finalizeRound(uint256 _crashPoint, string memory _salt) external {
        require(msg.sender == authorizedServer || msg.sender == owner(), "Not authorized");
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

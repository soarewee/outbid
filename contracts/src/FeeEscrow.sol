// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

interface IToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title FeeEscrow
/// @notice Holds the bond a vendor posts to bid in an Outbid auction. A vendor that loses gets its bond back
///         at once. The winner's bond stays until Outbid attests that the deal's first card charge cleared;
///         then it becomes Outbid's fee for the sale. If no charge clears by the deadline, the vendor takes
///         its bond back itself.
/// @dev The contract can't see the card network. The attester reports the cleared Airwallex transaction and
///      its id is stored as the proof. The attester can only send a bond two ways: to the fee account with a
///      proof, or back to the vendor that posted it. On Metal a credit can be quarantined instead of landing,
///      so every transfer checks that the recipient's balance rose by the full amount.
contract FeeEscrow {
    enum State {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Deal {
        address vendor;
        uint64 deadline;
        State state;
        uint256 amount;
        /// keccak256 of the Airwallex transaction id that proved the sale.
        bytes32 proof;
    }

    IToken public immutable token;
    address public immutable attester;
    /// Outbid's fees. Any cashback to a buyer is Outbid's own, paid from here through Airwallex Payouts.
    address public immutable feeAccount;

    mapping(bytes32 dealId => Deal) public deals;
    bool private locked;

    event Funded(bytes32 indexed dealId, address indexed vendor, uint256 amount, uint64 deadline);
    event Released(bytes32 indexed dealId, bytes32 proof, uint256 fee);
    event Refunded(bytes32 indexed dealId, uint256 amount);

    error WrongState(State state);
    error NotAllowed();
    error BadTerms();
    error TooEarly();
    error TooLate();
    error TransferShort(address to, uint256 expected, uint256 received);

    modifier nonReentrant() {
        if (locked) revert NotAllowed();
        locked = true;
        _;
        locked = false;
    }

    constructor(IToken token_, address attester_, address feeAccount_) {
        token = token_;
        attester = attester_;
        feeAccount = feeAccount_;
    }

    /// A vendor posts `amount` as its bond for `dealId` (one auction, one vendor) before it bids. It must
    /// approve the escrow first.
    function fund(bytes32 dealId, uint256 amount, uint64 deadline) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (deal.state != State.None) revert WrongState(deal.state);
        if (amount == 0 || deadline <= block.timestamp) revert BadTerms();
        deal.vendor = msg.sender;
        deal.amount = amount;
        deal.deadline = deadline;
        deal.state = State.Funded;
        _move(msg.sender, address(this), amount);
        emit Funded(dealId, msg.sender, amount, deadline);
    }

    /// Called by Outbid once the winner's first card charge has cleared. The bond becomes Outbid's fee.
    function release(bytes32 dealId, bytes32 proof) external nonReentrant {
        if (msg.sender != attester) revert NotAllowed();
        Deal storage deal = deals[dealId];
        if (deal.state != State.Funded) revert WrongState(deal.state);
        if (block.timestamp >= deal.deadline) revert TooLate();
        deal.state = State.Released;
        deal.proof = proof;
        _move(address(this), feeAccount, deal.amount);
        emit Released(dealId, proof, deal.amount);
    }

    /// The bond goes back to the vendor that posted it. Outbid returns it as soon as the vendor has lost the
    /// auction or the buyer has declined; the vendor can take it back itself once the deadline has passed
    /// with no charge cleared.
    function refund(bytes32 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (deal.state != State.Funded) revert WrongState(deal.state);
        if (msg.sender != attester) {
            if (msg.sender != deal.vendor) revert NotAllowed();
            if (block.timestamp < deal.deadline) revert TooEarly();
        }
        deal.state = State.Refunded;
        _move(address(this), deal.vendor, deal.amount);
        emit Refunded(dealId, deal.amount);
    }

    function _move(address from, address to, uint256 amount) private {
        if (amount == 0) return;
        uint256 before = token.balanceOf(to);
        bool ok = from == address(this) ? token.transfer(to, amount) : token.transferFrom(from, to, amount);
        uint256 received = token.balanceOf(to) - before;
        if (!ok || received != amount) revert TransferShort(to, amount, received);
    }
}

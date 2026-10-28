// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

interface IToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title FeeEscrow
/// @notice Holds the acquisition fee a vendor prepays when its bid wins. When Outbid attests that the deal's
///         first card charge cleared, one call splits the fee between the buyer's rebate and Outbid's fee.
///         If no charge clears by the deadline, the vendor takes its fee back.
/// @dev The contract can't see the card network. The attester reports the cleared Airwallex transaction and
///      its id is stored as the proof. The rebate share is fixed at deployment, so neither the vendor nor
///      the attester can change a deal's split. On Metal a credit can be quarantined instead of landing, so
///      every transfer checks that the recipient's balance rose by the full amount.
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

    uint256 private constant BPS = 10_000;

    IToken public immutable token;
    address public immutable attester;
    /// Collects buyers' rebates, which Outbid pays out to each buyer's bank through Airwallex Payouts.
    address public immutable rebateAccount;
    address public immutable feeAccount;
    uint16 public immutable rebateBps;

    mapping(bytes32 dealId => Deal) public deals;
    bool private locked;

    event Funded(bytes32 indexed dealId, address indexed vendor, uint256 amount, uint64 deadline);
    event Released(bytes32 indexed dealId, bytes32 proof, uint256 rebate, uint256 fee);
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

    constructor(IToken token_, address attester_, address rebateAccount_, address feeAccount_, uint16 rebateBps_) {
        if (rebateBps_ > BPS) revert BadTerms();
        token = token_;
        attester = attester_;
        rebateAccount = rebateAccount_;
        feeAccount = feeAccount_;
        rebateBps = rebateBps_;
    }

    /// The winning vendor prepays `amount` for `dealId`. It must approve the escrow first.
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

    /// Called by Outbid once the deal's first card charge has cleared. Splits the fee in one transaction.
    function release(bytes32 dealId, bytes32 proof) external nonReentrant {
        if (msg.sender != attester) revert NotAllowed();
        Deal storage deal = deals[dealId];
        if (deal.state != State.Funded) revert WrongState(deal.state);
        if (block.timestamp >= deal.deadline) revert TooLate();
        uint256 rebate = deal.amount * rebateBps / BPS;
        uint256 fee = deal.amount - rebate;
        deal.state = State.Released;
        deal.proof = proof;
        _move(address(this), rebateAccount, rebate);
        _move(address(this), feeAccount, fee);
        emit Released(dealId, proof, rebate, fee);
    }

    /// The vendor takes its fee back if no charge cleared by the deadline.
    function refund(bytes32 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (deal.state != State.Funded) revert WrongState(deal.state);
        if (msg.sender != deal.vendor) revert NotAllowed();
        if (block.timestamp < deal.deadline) revert TooEarly();
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

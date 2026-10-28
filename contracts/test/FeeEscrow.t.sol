// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {FeeEscrow, IToken} from "../src/FeeEscrow.sol";

interface Vm {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function expectRevert(bytes calldata revertData) external;
}

/// A MIP20 stand-in. With `quarantine` set, credits to `quarantined` go to a holding address instead,
/// as Metal's receive screening can do.
contract TestToken is IToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public quarantined;
    address public constant HOLDING = address(0xdead);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function quarantine(address account) external {
        quarantined = account;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to == quarantined ? HOLDING : to] += amount;
    }
}

contract FeeEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant ATTESTER = address(0xA11);
    address private constant VENDOR = address(0xB0B);
    address private constant REBATES = address(0xBEE);
    address private constant FEES = address(0xFEE);
    bytes32 private constant DEAL = keccak256("intent-1:Vendor B");
    bytes32 private constant PROOF = keccak256("airwallex-tx-1");

    TestToken private token;
    FeeEscrow private escrow;

    function setUp() public {
        vm.warp(1_000_000);
        token = new TestToken();
        escrow = new FeeEscrow(token, ATTESTER, REBATES, FEES, 8_000);
        token.mint(VENDOR, 100 ether);
        vm.prank(VENDOR);
        token.approve(address(escrow), 25 ether);
        vm.prank(VENDOR);
        escrow.fund(DEAL, 25 ether, uint64(block.timestamp + 30 days));
    }

    function test_releaseSplitsTheFeeOnce() public {
        vm.prank(ATTESTER);
        escrow.release(DEAL, PROOF);
        assertEq(token.balanceOf(REBATES), 20 ether);
        assertEq(token.balanceOf(FEES), 5 ether);
        (,, FeeEscrow.State state,, bytes32 proof) = escrow.deals(DEAL);
        assert(state == FeeEscrow.State.Released);
        assert(proof == PROOF);

        vm.expectRevert(abi.encodeWithSelector(FeeEscrow.WrongState.selector, FeeEscrow.State.Released));
        vm.prank(ATTESTER);
        escrow.release(DEAL, PROOF);
    }

    function test_onlyTheAttesterReleases() public {
        vm.expectRevert(abi.encodeWithSelector(FeeEscrow.NotAllowed.selector));
        vm.prank(VENDOR);
        escrow.release(DEAL, PROOF);
    }

    function test_vendorIsRefundedOnlyAfterTheDeadline() public {
        vm.expectRevert(abi.encodeWithSelector(FeeEscrow.TooEarly.selector));
        vm.prank(VENDOR);
        escrow.refund(DEAL);

        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(abi.encodeWithSelector(FeeEscrow.TooLate.selector));
        vm.prank(ATTESTER);
        escrow.release(DEAL, PROOF);

        vm.prank(VENDOR);
        escrow.refund(DEAL);
        assertEq(token.balanceOf(VENDOR), 100 ether);
    }

    function test_aDealCannotBeFundedTwice() public {
        vm.expectRevert(abi.encodeWithSelector(FeeEscrow.WrongState.selector, FeeEscrow.State.Funded));
        vm.prank(VENDOR);
        escrow.fund(DEAL, 1 ether, uint64(block.timestamp + 1 days));
    }

    function test_aQuarantinedRebateRollsTheReleaseBack() public {
        token.quarantine(REBATES);
        vm.expectRevert(abi.encodeWithSelector(FeeEscrow.TransferShort.selector, REBATES, 20 ether, 0));
        vm.prank(ATTESTER);
        escrow.release(DEAL, PROOF);
        (,, FeeEscrow.State state,,) = escrow.deals(DEAL);
        assert(state == FeeEscrow.State.Funded);
        assertEq(token.balanceOf(address(escrow)), 25 ether);
    }

    function assertEq(uint256 a, uint256 b) private pure {
        require(a == b, "not equal");
    }
}

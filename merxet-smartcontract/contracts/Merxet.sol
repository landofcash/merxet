pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title Merxet
 * @dev Unified contract for Catalogs, Orders, and Escrow on Hedera.
 */
contract Merxet is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address payable;

    // --- Enums ---
    enum OrderState { 
        None,               // 0: Non-existent
        Initial,            // 1: Created but not paid
        Paid,               // 2: Funds in escrow
        Delivering,         // 3: Seller shipped/provided info
        Completed,          // 4: Buyer confirmed, funds released to seller
        RefundReq,          // 5: Buyer requested refund
        RefundedToBuyer,    // 6: Funds returned to buyer by admin
        RefundedToSeller,   // 7: Funds released to seller by admin
        Canceled            // 8: Order canceled (e.g. refused by seller)
    }

    // --- Structs ---
    struct Catalog {
        uint8 version;
        address seller;
        bytes sellerPubKey;
        string catalogUrl;
    }

    struct Order {
        uint8 version;
        bytes32 catalogSeed;
        OrderState status;
        uint256 priceAmount;
        address priceToken; // address(0) for HBAR
        address seller;
        address buyer;
        address payer;
        bytes buyerPubKey;
        bytes sellerPubKey;
        bytes encSymKeyBuyer;
        bytes encSymKeySeller;
        bytes32 symKeyHash;
        bytes32 payloadHashBuyer;
        bytes32 payloadHashSeller;
        uint64 createdTs;
        uint64 updatedTs;
    }

    // --- State Variables ---
    mapping(bytes32 => Catalog) public catalogs;
    mapping(bytes32 => Order) public orders;
    
    string public hcsTopicId;
    uint256 public orderTimeout = 5 days;

    // --- Events ---
    event CatalogCreated(bytes32 indexed seed, address indexed seller);
    event CatalogUpdated(bytes32 indexed seed);
    event CatalogDeleted(bytes32 indexed seed);

    event OrderCreated(bytes32 indexed seed, address indexed buyer, address indexed seller);
    event OrderPaid(bytes32 indexed seed);
    event OrderDelivering(bytes32 indexed seed);
    event OrderCompleted(bytes32 indexed seed);
    event OrderRefundRequested(bytes32 indexed seed);
    event OrderRefundedToBuyer(bytes32 indexed seed);
    event OrderRefundedToSeller(bytes32 indexed seed);
    event OrderCanceled(bytes32 indexed seed);
    event OrderDeleted(bytes32 indexed seed);

    // --- Modifiers ---
    modifier inState(bytes32 orderId, OrderState expected) {
        require(orders[orderId].status == expected, "Merxet: Invalid order state");
        _;
    }

    modifier onlyBuyer(bytes32 orderId) {
        require(msg.sender == orders[orderId].buyer, "Merxet: Not the buyer");
        _;
    }

    modifier onlySeller(bytes32 orderId) {
        require(msg.sender == orders[orderId].seller, "Merxet: Not the seller");
        _;
    }

    modifier onlyCatalogSeller(bytes32 catalogSeed) {
        require(msg.sender == catalogs[catalogSeed].seller, "Merxet: Not the shop owner");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setHcsTopicId(string calldata _topicId) external onlyOwner {
        hcsTopicId = _topicId;
    }

    function setOrderTimeout(uint256 _timeout) external onlyOwner {
        require(_timeout >= 1 days, "Merxet: Timeout too short");
        orderTimeout = _timeout;
    }

    // --- Catalog Functions ---

    function createCatalog(
        bytes32 seed,
        bytes calldata sellerPubKey,
        string calldata url
    ) external {
        require(catalogs[seed].seller == address(0), "Merxet: Catalog already exists");
        catalogs[seed] = Catalog({
            version: 1,
            seller: msg.sender,
            sellerPubKey: sellerPubKey,
            catalogUrl: url
        });
        emit CatalogCreated(seed, msg.sender);
    }

    function updateCatalog(bytes32 seed, string calldata newUrl) external onlyCatalogSeller(seed) {
        catalogs[seed].catalogUrl = newUrl;
        emit CatalogUpdated(seed);
    }

    function deleteCatalog(bytes32 seed) external onlyCatalogSeller(seed) {
        delete catalogs[seed];
        emit CatalogDeleted(seed);
    }

    // --- Order Functions ---

    function createOrderInitial(
        bytes32 seed,
        bytes32 catalogSeed,
        uint256 priceAmount,
        address priceToken,
        bytes calldata buyerPubKey,
        bytes calldata encKeyBuyer,
        bytes calldata encKeySeller,
        bytes32 symKeyHash,
        bytes32 payloadHashBuyer
    ) external {
        require(orders[seed].status == OrderState.None, "Merxet: Order already exists");

        Catalog storage catalog = catalogs[catalogSeed];
        require(catalog.seller != address(0), "Merxet: Catalog does not exist");
        
        orders[seed] = Order({
            version: 1,
            catalogSeed: catalogSeed,
            status: OrderState.Initial,
            priceAmount: priceAmount,
            priceToken: priceToken,
            seller: catalog.seller,
            buyer: msg.sender,
            payer: address(0),
            buyerPubKey: buyerPubKey,
            sellerPubKey: catalog.sellerPubKey,
            encSymKeyBuyer: encKeyBuyer,
            encSymKeySeller: encKeySeller,
            symKeyHash: symKeyHash,
            payloadHashBuyer: payloadHashBuyer,
            payloadHashSeller: bytes32(0),
            createdTs: uint64(block.timestamp),
            updatedTs: uint64(block.timestamp)
        });

        emit OrderCreated(seed, msg.sender, catalog.seller);
    }

    function createOrderPaid(
        bytes32 seed,
        bytes32 catalogSeed,
        uint256 priceAmount,
        address priceToken,
        bytes calldata buyerPubKey,
        bytes calldata encKeyBuyer,
        bytes calldata encKeySeller,
        bytes32 symKeyHash,
        bytes32 payloadHashBuyer
    ) external payable nonReentrant {
        require(orders[seed].status == OrderState.None, "Merxet: Order already exists");

        Catalog storage catalog = catalogs[catalogSeed];
        require(catalog.seller != address(0), "Merxet: Catalog does not exist");

        orders[seed] = Order({
            version: 1,
            catalogSeed: catalogSeed,
            status: OrderState.Paid,
            priceAmount: priceAmount,
            priceToken: priceToken,
            seller: catalog.seller,
            buyer: msg.sender,
            payer: msg.sender,
            buyerPubKey: buyerPubKey,
            sellerPubKey: catalog.sellerPubKey,
            encSymKeyBuyer: encKeyBuyer,
            encSymKeySeller: encKeySeller,
            symKeyHash: symKeyHash,
            payloadHashBuyer: payloadHashBuyer,
            payloadHashSeller: bytes32(0),
            createdTs: uint64(block.timestamp),
            updatedTs: uint64(block.timestamp)
        });

        _deposit(priceToken, priceAmount);
        
        emit OrderCreated(seed, msg.sender, catalog.seller);
        emit OrderPaid(seed);
    }

    function buyOrder(bytes32 seed) external payable inState(seed, OrderState.Initial) nonReentrant {
        Order storage order = orders[seed];
        require(order.payer == address(0), "Merxet: Already paid");
        
        order.payer = msg.sender;
        order.status = OrderState.Paid;
        order.updatedTs = uint64(block.timestamp);

        _deposit(order.priceToken, order.priceAmount);

        emit OrderPaid(seed);
    }


    function cancelOrder(bytes32 seed) external nonReentrant {
        Order storage order = orders[seed];
        OrderState status = order.status;
        require(status != OrderState.None, "Merxet: Order does not exist");
        if (status == OrderState.Initial) {
            require(msg.sender == order.buyer || msg.sender == owner(), "Merxet: Unauthorized");

            order.status = OrderState.Canceled;
            order.updatedTs = uint64(block.timestamp);
            
            emit OrderCanceled(seed);
        } else if (status == OrderState.Paid) {
            require(order.payer != address(0), "Merxet: Invalid payer");
            require(msg.sender == order.payer || msg.sender == order.buyer || msg.sender == owner(), "Merxet: Only payer or buyer can cancel");

            order.status = OrderState.Canceled;
            order.updatedTs = uint64(block.timestamp);
            
            _payout(order.priceToken, order.payer, order.priceAmount);
            
            emit OrderCanceled(seed);
        } else {
            revert("Merxet: Invalid order state for cancellation");
        }
    }

    function startDelivering(
        bytes32 seed,
        bytes32 payloadHashSeller
    ) external onlySeller(seed) inState(seed, OrderState.Paid) {
        Order storage order = orders[seed];
        order.status = OrderState.Delivering;
        order.payloadHashSeller = payloadHashSeller;
        order.updatedTs = uint64(block.timestamp);
        
        emit OrderDelivering(seed);
    }

    function confirmOrder(bytes32 seed) external onlyBuyer(seed) inState(seed, OrderState.Delivering) nonReentrant {
        Order storage order = orders[seed];
        order.status = OrderState.Completed;
        order.updatedTs = uint64(block.timestamp);

        _payout(order.priceToken, order.seller, order.priceAmount);

        emit OrderCompleted(seed);
    }

    function refuseOrder(
        bytes32 seed,
        bytes32 payloadHashSeller
    ) external onlySeller(seed) inState(seed, OrderState.Paid) nonReentrant {
        Order storage order = orders[seed];
        order.status = OrderState.Canceled;
        order.payloadHashSeller = payloadHashSeller;
        order.updatedTs = uint64(block.timestamp);
        
        _payout(order.priceToken, order.payer, order.priceAmount);

        emit OrderCanceled(seed);
    }

    function requireRefund(bytes32 seed) external onlyBuyer(seed) inState(seed, OrderState.Delivering) {
        Order storage order = orders[seed];
        order.status = OrderState.RefundReq;
        order.updatedTs = uint64(block.timestamp);
        
        emit OrderRefundRequested(seed);
    }

    function processRefundToBuyer(bytes32 seed) external onlyOwner inState(seed, OrderState.RefundReq) nonReentrant {
        Order storage order = orders[seed];
        order.status = OrderState.RefundedToBuyer;
        order.updatedTs = uint64(block.timestamp);

        _payout(order.priceToken, order.payer, order.priceAmount);

        emit OrderRefundedToBuyer(seed);
    }

    function processRefundToSeller(bytes32 seed) external onlyOwner inState(seed, OrderState.RefundReq) nonReentrant {
        Order storage order = orders[seed];
        order.status = OrderState.RefundedToSeller;
        order.updatedTs = uint64(block.timestamp);

        _payout(order.priceToken, order.seller, order.priceAmount);

        emit OrderRefundedToSeller(seed);
    }

    function checkTimeouts(bytes32 seed) external nonReentrant {
        Order storage order = orders[seed];
        require(block.timestamp > uint256(order.updatedTs) + orderTimeout, "Merxet: Timeout not reached");

        if (order.status == OrderState.Delivering) {
            // Auto-confirm if no action after timeout in Delivering
            order.status = OrderState.Completed;
            order.updatedTs = uint64(block.timestamp);
            _payout(order.priceToken, order.seller, order.priceAmount);
            emit OrderCompleted(seed);
        } else if (order.status == OrderState.Initial) {
             // Auto-cancel if not paid
             order.status = OrderState.Canceled;
             order.updatedTs = uint64(block.timestamp);
             emit OrderCanceled(seed);
        }
    }

    function deleteOrder(bytes32 seed) external {
        Order storage order = orders[seed];
        require(msg.sender == order.buyer || msg.sender == order.seller || msg.sender == owner(), "Merxet: Unauthorized");
        
        // Only allow deletion if in a terminal state or if it's an initial unpaid order
        bool canDelete = (order.status == OrderState.Completed || 
                          order.status == OrderState.RefundedToBuyer || 
                          order.status == OrderState.RefundedToSeller || 
                          order.status == OrderState.Canceled ||
                          order.status == OrderState.Initial);
        require(canDelete, "Merxet: Cannot delete active order");
        delete orders[seed];
        emit OrderDeleted(seed);
    }

    // --- Internal Helpers ---

    function _deposit(address token, uint256 amount) internal {
        if (token == address(0)) {
            require(msg.value >= amount, "Merxet: Underpaid HBAR");
            // Refund excess HBAR if any
            if (msg.value > amount) {
                payable(msg.sender).sendValue(msg.value - amount);
            }
        } else {
            require(msg.value == 0, "Merxet: Do not send HBAR with ERC-20");
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function _payout(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            payable(to).sendValue(amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // Fallback for receiving HBAR
    receive() external payable {}
}

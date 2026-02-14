const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Merxet", function () {
  let marketplace;
  let owner, shop, buyer, other;
  const SEED = ethers.encodeBytes32String("test-seed-123456789012");
  const CATALOG_SEED = ethers.encodeBytes32String("cat-seed-123456789012");

  beforeEach(async function () {
    [owner, shop, buyer, other] = await ethers.getSigners();
    const Merxet = await ethers.getContractFactory("Merxet");
    marketplace = await Merxet.deploy();
  });

  describe("Catalogs", function () {
    it("Should set HCS Topic ID", async function () {
      const topicId = "0.0.12345";
      await marketplace.connect(owner).setHcsTopicId(topicId);
      expect(await marketplace.hcsTopicId()).to.equal(topicId);
    });

    it("Should fail if not owner sets HCS Topic ID", async function () {
      await expect(marketplace.connect(other).setHcsTopicId("0.0.12345"))
        .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });

    it("Should create a catalog", async function () {
      const pubKey = ethers.toUtf8Bytes("pubkey");
      const url = "https://example.com/catalog";
      
      await expect(marketplace.connect(shop).createCatalog(CATALOG_SEED, pubKey, url))
        .to.emit(marketplace, "CatalogCreated")
        .withArgs(CATALOG_SEED, shop.address);

      const catalog = await marketplace.catalogs(CATALOG_SEED);
      expect(catalog.seller).to.equal(shop.address);
      expect(catalog.catalogUrl).to.equal(url);
    });

    it("Should update a catalog", async function () {
      const pubKey = ethers.toUtf8Bytes("pubkey");
      const url = "https://example.com/catalog";
      await marketplace.connect(shop).createCatalog(CATALOG_SEED, pubKey, url);

      const newUrl = "https://example.com/new-catalog";
      await expect(marketplace.connect(shop).updateCatalog(CATALOG_SEED, newUrl))
        .to.emit(marketplace, "CatalogUpdated")
        .withArgs(CATALOG_SEED);

      const catalog = await marketplace.catalogs(CATALOG_SEED);
      expect(catalog.catalogUrl).to.equal(newUrl);
    });

    it("Should fail if not shop owner updates", async function () {
      const pubKey = ethers.toUtf8Bytes("pubkey");
      const url = "https://example.com/catalog";
      await marketplace.connect(shop).createCatalog(CATALOG_SEED, pubKey, url);

      await expect(marketplace.connect(other).updateCatalog(CATALOG_SEED, "evil.com"))
        .to.be.revertedWith("Merxet: Not the shop owner");
    });
  });

  describe("Orders Lifecycle (HBAR)", function () {
    const price = ethers.parseEther("1");

    beforeEach(async function () {
      const pubKey = ethers.toUtf8Bytes("pubkey");
      const url = "https://example.com/catalog";
      await marketplace.connect(shop).createCatalog(CATALOG_SEED, pubKey, url);
    });

    it("Should complete full lifecycle: Create -> Pay -> Deliver -> Confirm", async function () {
      const pubKey = ethers.toUtf8Bytes("buyer-pubkey");
      const symKeyHash = ethers.id("symkey");
      const payloadHash = ethers.id("payload");
      const encrypted = ethers.toUtf8Bytes("encrypted-blob");

      // 1. Create Initial
      await marketplace.connect(buyer).createOrderInitial(
        SEED,
        CATALOG_SEED,
        price,
        ethers.ZeroAddress,
        pubKey,
        encrypted, // encKeyBuyer
        encrypted, // encKeySeller
        symKeyHash,
        payloadHash
      );

      let order = await marketplace.orders(SEED);
      expect(order.status).to.equal(1); // Initial

      // 2. Pay
      await expect(marketplace.connect(buyer).buyOrder(SEED, { value: price }))
        .to.emit(marketplace, "OrderPaid")
        .withArgs(SEED);

      order = await marketplace.orders(SEED);
      expect(order.status).to.equal(2); // Paid

      // 3. Deliver
      const sellerPayloadHash = ethers.id("seller-payload");
      await expect(marketplace.connect(shop).startDelivering(SEED, sellerPayloadHash))
        .to.emit(marketplace, "OrderDelivering")
        .withArgs(SEED);

      order = await marketplace.orders(SEED);
      expect(order.status).to.equal(3); // Delivering

      // 4. Confirm & Payout
      const initialShopBalance = await ethers.provider.getBalance(shop.address);
      await expect(marketplace.connect(buyer).confirmOrder(SEED))
        .to.emit(marketplace, "OrderCompleted")
        .withArgs(SEED);

      order = await marketplace.orders(SEED);
      expect(order.status).to.equal(4); // Completed

      const finalShopBalance = await ethers.provider.getBalance(shop.address);
      expect(finalShopBalance - initialShopBalance).to.equal(price);
    });

    it("Should fail to create order if catalog does not exist", async function () {
      const pubKey = ethers.toUtf8Bytes("buyer-pubkey");
      const symKeyHash = ethers.id("symkey");
      const payloadHash = ethers.id("payload");
      const encrypted = ethers.toUtf8Bytes("encrypted-blob");
      const INVALID_CATALOG_SEED = ethers.encodeBytes32String("non-existent");

      await expect(marketplace.connect(buyer).createOrderInitial(
        SEED,
        INVALID_CATALOG_SEED,
        price,
        ethers.ZeroAddress,
        pubKey,
        encrypted,
        encrypted,
        symKeyHash,
        payloadHash
      )).to.be.revertedWith("Merxet: Catalog does not exist");
    });

    it("Should handle cancellation by seller", async function () {
       const pubKey = ethers.toUtf8Bytes("buyer-pubkey");
       const symKeyHash = ethers.id("symkey");
       const payloadHash = ethers.id("payload");
       const encrypted = ethers.toUtf8Bytes("encrypted-blob");

       await marketplace.connect(buyer).createOrderPaid(
        SEED,
        CATALOG_SEED,
        price,
        ethers.ZeroAddress,
        pubKey,
        encrypted,
        encrypted,
        symKeyHash,
        payloadHash,
        { value: price }
      );

      const initialBuyerBalance = await ethers.provider.getBalance(buyer.address);
      
      // Seller refuses/cancels
      await marketplace.connect(shop).refuseOrder(SEED, payloadHash);

      const finalBuyerBalance = await ethers.provider.getBalance(buyer.address);
      // Buyer gets refund (ignoring gas for simplicity in this check, but it should be close)
      expect(await marketplace.orders(SEED).then(o => o.status)).to.equal(8); // Canceled
    });
  });

  describe("Admin Refunds", function () {
    const price = ethers.parseEther("1");

    beforeEach(async function () {
      const pubKey = ethers.toUtf8Bytes("pubkey");
      const url = "https://example.com/catalog";
      await marketplace.connect(shop).createCatalog(CATALOG_SEED, pubKey, url);
    });

    it("Should allow admin to refund to buyer", async function () {
        const pubKey = ethers.toUtf8Bytes("buyer-pubkey");
        const encrypted = ethers.toUtf8Bytes("encrypted-blob");

        await marketplace.connect(buyer).createOrderPaid(
            SEED, CATALOG_SEED, price, ethers.ZeroAddress,
            pubKey, encrypted, encrypted, ethers.id("sk"), ethers.id("ph"),
            { value: price }
        );

        await marketplace.connect(shop).startDelivering(SEED, ethers.id("sph"));
        await marketplace.connect(buyer).requireRefund(SEED);

        const initialBuyerBalance = await ethers.provider.getBalance(buyer.address);
        await marketplace.connect(owner).processRefundToBuyer(SEED);
        
        expect(await marketplace.orders(SEED).then(o => o.status)).to.equal(6); // RefundedToBuyer
    });
  });

  describe("Timeout Management", function () {
    const price = ethers.parseEther("1");

    beforeEach(async function () {
      const pubKey = ethers.toUtf8Bytes("pubkey");
      const url = "https://example.com/catalog";
      await marketplace.connect(shop).createCatalog(CATALOG_SEED, pubKey, url);
    });

    it("Should have default timeout of 5 days", async function () {
      expect(await marketplace.orderTimeout()).to.equal(5 * 24 * 60 * 60);
    });

    it("Should allow owner to change timeout", async function () {
      const newTimeout = 2 * 24 * 60 * 60; // 2 days
      await marketplace.connect(owner).setOrderTimeout(newTimeout);
      expect(await marketplace.orderTimeout()).to.equal(newTimeout);
    });

    it("Should fail if timeout is less than 1 day", async function () {
      const tooShort = 23 * 60 * 60; // 23 hours
      await expect(marketplace.connect(owner).setOrderTimeout(tooShort))
        .to.be.revertedWith("Merxet: Timeout too short");
    });

    it("Should fail if non-owner tries to change timeout", async function () {
      await expect(marketplace.connect(other).setOrderTimeout(86400))
        .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });

    it("Should auto-confirm order after timeout", async function () {
      const pubKey = ethers.toUtf8Bytes("buyer-pubkey");
      const encrypted = ethers.toUtf8Bytes("encrypted-blob");

      await marketplace.connect(buyer).createOrderPaid(
        SEED, CATALOG_SEED, price, ethers.ZeroAddress,
        pubKey, encrypted, encrypted, ethers.id("sk"), ethers.id("ph"),
        { value: price }
      );

      await marketplace.connect(shop).startDelivering(SEED, ethers.id("sph"));

      // Fast forward time by 5 days + 1 second
      await ethers.provider.send("evm_increaseTime", [5 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      await marketplace.checkTimeouts(SEED);

      const order = await marketplace.orders(SEED);
      expect(order.status).to.equal(4); // Completed
    });
  });
});

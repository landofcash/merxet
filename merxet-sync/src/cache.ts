import Loki from 'lokijs';
import {CatalogStore, CatalogCacheEntry, OrderStore, OrderCacheEntry} from './types/types';

interface ChainCursor {
  key: string;
  blockNumber: number;
  logIndex: number;
}

class AppDatabase {
  private db: Loki;
  private catalogs!: Collection<CatalogStore>;
  private orders!: Collection<OrderStore>;
  private chainCursors!: Collection<ChainCursor>;
  private initialized: boolean = false;

  constructor() {
    // Initialize Loki without file persistence
    this.db = new Loki('memory-db');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize the collections directly in memory
    this.catalogs = this.db.addCollection('catalogs', {
      unique: ['id'],
      indices: ['sellerWallet', 'networkName', 'id']
    });

    this.orders = this.db.addCollection('orders', {
      unique: ['id'],
      indices: ['buyerWallet', 'networkName', 'id']
    });

    this.chainCursors = this.db.addCollection('chainCursors', {
      unique: ['key'],
      indices: ['key']
    });

    this.initialized = true;
  }

  async getCatalogsByWallet(sellerWallet: string, networkName: string): Promise<CatalogStore | null> {
    await this.ensureInitialized();
    const key = `${sellerWallet}-${networkName}`;
    return this.catalogs.findOne({id: key}) || null;
  }

  async getOrdersByWallet(buyerWallet: string, networkName: string): Promise<OrderStore | null> {
    await this.ensureInitialized();
    const key = `${buyerWallet}-${networkName}`;
    return this.orders.findOne({id: key}) || null;
  }

  async upsertCatalogs(
    sellerWallet: string,
    networkName: string,
    newProducts: CatalogCacheEntry[],
    replace: boolean = false
  ): Promise<void> {
    await this.ensureInitialized();

    const key = `${sellerWallet}-${networkName}`;
    const existing = this.catalogs.findOne({id: key});
    if (existing) {
      if (replace) {
        // Replace the entire product list
        existing.catalogs = newProducts;
      } else {
        // Merge new catalogs with existing ones
        const updatedProducts = [...existing.catalogs];
        for (const newProduct of newProducts) {
          const index = updatedProducts.findIndex(p => p.seed === newProduct.seed);
          if (index >= 0) {
            updatedProducts[index] = newProduct;
          } else {
            updatedProducts.push(newProduct);
          }
        }
        existing.catalogs = updatedProducts;
      }
      existing.networkName = networkName;
      this.catalogs.update(existing);
    } else {
      this.catalogs.insert({
        id: key,
        sellerWallet,
        networkName,
        catalogs: newProducts
      });
    }
  }

  async upsertOrders(
    buyerWallet: string,
    networkName: string,
    newOrders: OrderCacheEntry[],
    replace: boolean = false
  ): Promise<void> {
    await this.ensureInitialized();

    const key = `${buyerWallet}-${networkName}`;
    const existing = this.orders.findOne({id: key});
    if (existing) {
      if (replace) {
        // Replace the entire orders list
        existing.orders = newOrders;
      } else {
        // Merge new orders with existing ones
        const updatedOrders = [...existing.orders];
        for (const newOrder of newOrders) {
          const index = updatedOrders.findIndex(o => o.seed === newOrder.seed);
          if (index >= 0) {
            updatedOrders[index] = newOrder;
          } else {
            updatedOrders.push(newOrder);
          }
        }
        existing.orders = updatedOrders;
      }
      existing.networkName = networkName;
      this.orders.update(existing);
    } else {
      this.orders.insert({
        id: key,
        buyerWallet,
        networkName,
        orders: newOrders
      });
    }
  }

  async getAllCatalogs(networkName: string): Promise<CatalogStore[]> {
    await this.ensureInitialized();
    return this.catalogs.find({"networkName": networkName});
  }

  async getAllOrders(networkName: string): Promise<OrderStore[]> {
    await this.ensureInitialized();
    return this.orders.find({"networkName": networkName});
  }

  async getAllChainCursors(): Promise<ChainCursor[]> {
    await this.ensureInitialized();
    return this.chainCursors.find({});
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.catalogs.clear();
    this.orders.clear();
    this.chainCursors.clear();
  }

  // Chain cursors (Hedera EVM logs) by key
  async getChainCursor(key: string): Promise<{ blockNumber: number; logIndex: number } | null> {
    await this.ensureInitialized();
    const row = this.chainCursors.findOne({ key });
    return row ? { blockNumber: row.blockNumber, logIndex: row.logIndex } : null;
  }

  async setChainCursor(key: string, cursor: { blockNumber: number; logIndex: number }): Promise<void> {
    await this.ensureInitialized();
    const existing = this.chainCursors.findOne({ key });
    if (existing) {
      existing.blockNumber = cursor.blockNumber;
      existing.logIndex = cursor.logIndex;
      this.chainCursors.update(existing);
    } else {
      this.chainCursors.insert({ key, blockNumber: cursor.blockNumber, logIndex: cursor.logIndex });
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export a singleton instance
export const appDb = new AppDatabase();

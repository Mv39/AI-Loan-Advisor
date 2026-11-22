import productsJson from '../data/products.json';
import type { Product } from './types';

const products: readonly Product[] = Object.freeze(productsJson as Product[]);

export const catalog = {
  all(): readonly Product[] {
    return products;
  },
  byId(id: string): Product | undefined {
    return products.find((p) => p.id === id);
  },
};

export type Catalog = typeof catalog;

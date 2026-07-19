import { describe, expect, it } from 'vitest';
import { activeKrogerMatch, cartSearchTerm, isApprovedForKroger, isKrogerReviewComplete, krogerStatusLabel } from './krogerCart';
import type { KrogerPreviewItem, ShoppingListKrogerMatch } from './types';

const baseMatch: ShoppingListKrogerMatch = {
  id: 'match',
  shopping_list_item_id: 'item',
  kroger_product_upc: '000111',
  product_name: 'Milk',
  brand: 'Kroger',
  size: '1 gal',
  image_url: null,
  price: null,
  regular_price: null,
  promo_price: null,
  is_on_sale: false,
  package_quantity: 1,
  allow_substitutes: true,
  special_instructions: null,
  status: 'approved',
  last_error: null,
  created_by: 'user',
  created_at: '',
  updated_at: '',
};

describe('Kroger cart helpers', () => {
  it('builds a product search term from display name only', () => {
    expect(cartSearchTerm({ display_name: 'Black beans' })).toBe('Black beans');
  });

  it('requires an approved product and positive package count', () => {
    expect(isApprovedForKroger(baseMatch)).toBe(true);
    expect(isApprovedForKroger({ ...baseMatch, status: 'pending' })).toBe(false);
    expect(isApprovedForKroger({ ...baseMatch, package_quantity: 0 })).toBe(false);
    expect(isApprovedForKroger(null)).toBe(false);
  });

  it('reads active match and labels review status', () => {
    const item = { shopping_list_kroger_matches: [baseMatch] } as KrogerPreviewItem;
    expect(activeKrogerMatch(item)).toEqual(baseMatch);
    expect(krogerStatusLabel(baseMatch)).toBe('Approved');
    expect(krogerStatusLabel(null)).toBe('Needs review');
  });

  it('treats approved, skipped, and added items as complete in review queue', () => {
    expect(isKrogerReviewComplete(baseMatch)).toBe(true);
    expect(isKrogerReviewComplete({ ...baseMatch, status: 'skipped', kroger_product_upc: null })).toBe(true);
    expect(isKrogerReviewComplete({ ...baseMatch, status: 'added' })).toBe(true);
    expect(isKrogerReviewComplete({ ...baseMatch, status: 'failed' })).toBe(false);
    expect(isKrogerReviewComplete(null)).toBe(false);
  });
});

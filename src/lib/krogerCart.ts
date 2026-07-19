import type { KrogerPreviewItem, ShoppingListItem, ShoppingListKrogerMatch } from './types';

export function isKrogerEligibleItem(item: Pick<ShoppingListItem, 'is_removed' | 'is_checked'>, includeChecked = false) {
  return !item.is_removed && (includeChecked || !item.is_checked);
}

export function cartSearchTerm(item: Pick<ShoppingListItem, 'display_name' | 'unit' | 'notes'>) {
  return [item.display_name, item.unit].filter(Boolean).join(' ').trim();
}

export function activeKrogerMatch(item: KrogerPreviewItem): ShoppingListKrogerMatch | null {
  return item.shopping_list_kroger_matches?.[0] ?? null;
}

export function isApprovedForKroger(match: ShoppingListKrogerMatch | null) {
  return Boolean(match?.kroger_product_upc && match.status === 'approved' && match.package_quantity > 0);
}

export function isKrogerReviewComplete(match: ShoppingListKrogerMatch | null) {
  return Boolean(match && ['approved', 'skipped', 'added'].includes(match.status));
}

export function krogerStatusLabel(match: ShoppingListKrogerMatch | null) {
  if (!match) {
    return 'Needs review';
  }
  if (match.status === 'approved') {
    return 'Approved';
  }
  if (match.status === 'added') {
    return 'Added';
  }
  if (match.status === 'failed') {
    return 'Failed';
  }
  if (match.status === 'skipped') {
    return 'Skipped';
  }
  return 'Needs review';
}

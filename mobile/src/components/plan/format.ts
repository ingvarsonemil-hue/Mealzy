/** Whole-dollar amounts render without cents; everything else shows cents. */
export function formatMoney(amount: number): string {
  const isWhole = Number.isInteger(amount);
  return `$${amount.toFixed(isWhole ? 0 : 2)}`;
}

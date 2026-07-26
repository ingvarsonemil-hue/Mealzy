/* Ported from public/js/utils.js getCurrencySymbol() — used by dashboard,
 * meal-planner, and grocery-list to render costs in the user's currency. */
const SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', SEK: 'kr', NOK: 'kr', DKK: 'kr', CAD: '$', AUD: '$', NZD: '$',
  CHF: 'Fr', JPY: '¥', CNY: '¥', KRW: '₩', INR: '₹', BRL: 'R$', MXN: '$', ARS: '$', ZAR: 'R',
  AED: 'د.إ', SAR: '﷼', SGD: '$', HKD: '$', PLN: 'zł', CZK: 'Kč', HUF: 'Ft', TRY: '₺', THB: '฿',
  MYR: 'RM', IDR: 'Rp', PHP: '₱'
};

export function getCurrencySymbol(currency) {
  return SYMBOLS[currency] || currency || '$';
}

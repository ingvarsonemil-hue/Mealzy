// Shared utility functions — used across all pages

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCurrencySymbol(currency) {
  const symbols = {
    USD:'$',EUR:'€',GBP:'£',SEK:'kr',NOK:'kr',DKK:'kr',CAD:'$',AUD:'$',NZD:'$',CHF:'Fr',JPY:'¥',CNY:'¥',KRW:'₩',
    INR:'₹',BRL:'R$',MXN:'$',ARS:'$',ZAR:'R',AED:'د.إ',SAR:'﷼',SGD:'$',HKD:'$',PLN:'zł',CZK:'Kč',HUF:'Ft',TRY:'₺',THB:'฿',
    MYR:'RM',IDR:'Rp',PHP:'₱'
  };
  return symbols[currency] || currency || '$';
}

// Household size (1-8 people, default 1) — drives recipe/grocery ingredient scaling
function getHouseholdSize() {
  const n = parseInt(localStorage.getItem('mealzy_household_size'), 10);
  return (Number.isInteger(n) && n >= 1 && n <= 8) ? n : 1;
}

// Scales a quantity string like "200g", "1/2 cup", "1 1/2 tbsp" by a multiplier.
// Base amounts in meal/recipe data are always for 1 person — this is display-only scaling.
function scaleAmount(amount, multiplier) {
  if (amount === null || amount === undefined) return amount;
  const str = String(amount).trim();
  if (!multiplier || multiplier === 1) return str;
  const match = str.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*(.*)$/);
  if (!match) return str;
  const [, qtyStr, rest] = match;
  let qty;
  if (qtyStr.includes(' ')) {
    const [whole, frac] = qtyStr.split(' ');
    const [n, d] = frac.split('/').map(Number);
    qty = Number(whole) + n / d;
  } else if (qtyStr.includes('/')) {
    const [n, d] = qtyStr.split('/').map(Number);
    qty = n / d;
  } else {
    qty = parseFloat(qtyStr);
  }
  if (!Number.isFinite(qty)) return str;
  const scaled = qty * multiplier;
  const scaledStr = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return rest ? `${scaledStr} ${rest}` : scaledStr;
}

function scaleCost(cost, multiplier) {
  if (typeof cost !== 'number' || !Number.isFinite(cost)) return cost;
  return cost * (multiplier || 1);
}

function getLocalStores(currency) {
  const stores = {
    USD: [{n:'Walmart',e:'🏪'},{n:'Kroger',e:'🛒'},{n:'Whole Foods',e:'🌿'},{n:'Trader Joe\'s',e:'🌺'},{n:'Costco',e:'📦'}],
    GBP: [{n:'Tesco',e:'🏪'},{n:'Sainsbury\'s',e:'🛒'},{n:'Asda',e:'🟢'},{n:'Lidl',e:'🔵'},{n:'Waitrose',e:'🌿'}],
    EUR: [{n:'Lidl',e:'🔵'},{n:'Aldi',e:'🟡'},{n:'Carrefour',e:'🏪'},{n:'Rewe',e:'🛒'},{n:'Mercadona',e:'🟠'}],
    SEK: [{n:'ICA',e:'🔴'},{n:'Coop',e:'🟢'},{n:'Willys',e:'🏪'},{n:'Hemköp',e:'🛒'},{n:'Lidl',e:'🔵'}],
    NOK: [{n:'Rema 1000',e:'🔴'},{n:'Kiwi',e:'🥝'},{n:'Coop',e:'🟢'},{n:'Meny',e:'🏪'},{n:'Bunnpris',e:'🐰'}],
    DKK: [{n:'Netto',e:'🐕'},{n:'Bilka',e:'🏪'},{n:'Lidl',e:'🔵'},{n:'SuperBrugsen',e:'🛒'},{n:'Irma',e:'🐔'}],
    CAD: [{n:'Loblaws',e:'🏪'},{n:'Sobeys',e:'🛒'},{n:'Metro',e:'Ⓜ️'},{n:'No Frills',e:'🟡'},{n:'Costco',e:'📦'}],
    AUD: [{n:'Woolworths',e:'🟢'},{n:'Coles',e:'🔴'},{n:'Aldi',e:'🟡'},{n:'IGA',e:'🏪'},{n:'Harris Farm',e:'🌿'}],
    NZD: [{n:'Countdown',e:'🟢'},{n:'New World',e:'🌍'},{n:'Pak\'nSave',e:'🟡'},{n:'FreshChoice',e:'🥦'},{n:'Four Square',e:'🟦'}],
    CHF: [{n:'Migros',e:'🟠'},{n:'Coop',e:'🟢'},{n:'Lidl',e:'🔵'},{n:'Aldi',e:'🟡'},{n:'Denner',e:'🔴'}],
    JPY: [{n:'Aeon',e:'🏪'},{n:'Ito Yokado',e:'🛒'},{n:'Life',e:'🌿'},{n:'Seiyu',e:'🏬'},{n:'OK Store',e:'👌'}],
    CNY: [{n:'Hema Fresh',e:'🦈'},{n:'RT-Mart',e:'🏪'},{n:'Carrefour',e:'🛒'},{n:'Walmart',e:'🟡'},{n:'Yonghui',e:'🌿'}],
    KRW: [{n:'E-Mart',e:'🟡'},{n:'Lotte Mart',e:'🔴'},{n:'HomePlus',e:'🏪'},{n:'GS Supermarket',e:'🟢'},{n:'Hanaro Mart',e:'🥬'}],
    INR: [{n:'DMart',e:'🔵'},{n:'Reliance Fresh',e:'🟦'},{n:'Big Bazaar',e:'🏪'},{n:'Nature\'s Basket',e:'🌿'},{n:'Spencer\'s',e:'🛒'}],
    BRL: [{n:'Carrefour',e:'🏪'},{n:'Pão de Açúcar',e:'🍬'},{n:'Atacadão',e:'📦'},{n:'Extra',e:'🟢'},{n:'Assaí',e:'🟡'}],
    MXN: [{n:'Walmart',e:'🏪'},{n:'Soriana',e:'🛒'},{n:'Chedraui',e:'🟢'},{n:'La Comer',e:'🏬'},{n:'Costco',e:'📦'}],
    ZAR: [{n:'Woolworths',e:'🟢'},{n:'Pick n Pay',e:'🔵'},{n:'Checkers',e:'🏪'},{n:'Shoprite',e:'🔴'},{n:'Spar',e:'🟢'}],
    AED: [{n:'Carrefour',e:'🏪'},{n:'LuLu',e:'🟢'},{n:'Spinneys',e:'🛒'},{n:'Choithrams',e:'🔵'},{n:'Waitrose UAE',e:'🌿'}],
    SAR: [{n:'Panda',e:'🐼'},{n:'Carrefour',e:'🏪'},{n:'Tamimi',e:'🛒'},{n:'Danube',e:'🔵'},{n:'Othaim',e:'🏬'}],
    SGD: [{n:'NTUC FairPrice',e:'🟠'},{n:'Cold Storage',e:'🧊'},{n:'Sheng Siong',e:'🏪'},{n:'Giant',e:'🟢'},{n:'Mustafa',e:'🌙'}],
    HKD: [{n:'ParknShop',e:'🏪'},{n:'Wellcome',e:'🟢'},{n:'City\'super',e:'✨'},{n:'Jason\'s',e:'🔵'},{n:'Fusion',e:'🟡'}],
    PLN: [{n:'Biedronka',e:'🐞'},{n:'Lidl',e:'🔵'},{n:'Kaufland',e:'🏪'},{n:'Auchan',e:'🟠'},{n:'Żabka',e:'🐸'}],
    CZK: [{n:'Albert',e:'🏪'},{n:'Kaufland',e:'🟡'},{n:'Lidl',e:'🔵'},{n:'Penny',e:'🔴'},{n:'Billa',e:'🟢'}],
    HUF: [{n:'Tesco',e:'🏪'},{n:'Lidl',e:'🔵'},{n:'Aldi',e:'🟡'},{n:'Spar',e:'🟢'},{n:'Penny',e:'🔴'}],
    TRY: [{n:'BİM',e:'🔴'},{n:'A101',e:'🟠'},{n:'Migros',e:'🏪'},{n:'CarrefourSA',e:'🛒'},{n:'Şok',e:'🟡'}],
    THB: [{n:'Lotus\'s',e:'🌸'},{n:'Big C',e:'🟡'},{n:'Tops',e:'🏪'},{n:'Makro',e:'📦'},{n:'Villa Market',e:'🌿'}],
    MYR: [{n:'Giant',e:'🟢'},{n:'Tesco',e:'🏪'},{n:'Mydin',e:'🔵'},{n:'Aeon Big',e:'🟠'},{n:'Jaya Grocer',e:'🌿'}],
    IDR: [{n:'Indomaret',e:'🔴'},{n:'Alfamart',e:'🟠'},{n:'Giant',e:'🟢'},{n:'Hypermart',e:'🏪'},{n:'Ranch Market',e:'🌿'}],
    PHP: [{n:'SM Supermarket',e:'🏪'},{n:'Robinsons',e:'🟡'},{n:'Puregold',e:'🥇'},{n:'S&R',e:'📦'},{n:'Rustan\'s',e:'✨'}],
    ARS: [{n:'Carrefour',e:'🏪'},{n:'Coto',e:'🔵'},{n:'Día',e:'🟡'},{n:'Disco',e:'🟢'},{n:'Jumbo',e:'🐘'}]
  };
  return stores[currency] || stores['USD'];
}

// Bought from Teemah on 24 October 2026; stock taken on 26 October 2026 (handwritten list). Prices were not on the list.
import { MIXED } from './util.js';

const categories = [
  { id: 'bridal', name: 'Bridal heels', order: 1 },
  { id: 'corporate', name: 'Corporate heels', order: 2 },
  { id: 'zara', name: 'Zara heels', order: 3 },
  { id: 'mei', name: 'Mei heels', order: 4 },
  { id: 'other', name: 'Other heels', order: 5 },
  { id: 'handbags', name: 'Handbags', order: 6 },
  { id: 'perfumes', name: 'Perfumes', order: 7 },
];

// [category, name, sizes, mixedNote]
const rows = [
  // Bridal = 27
  ['bridal', 'Silver', { [MIXED]: 7 }, '37-42'],
  ['bridal', 'Gold', { [MIXED]: 10 }, '37-42'],
  ['bridal', 'Full silver bridal', { 36: 1, 42: 1 }],
  ['bridal', 'Valentino', { 36: 2, 37: 1 }],
  ['bridal', 'Silver with stones', { 36: 1 }],
  ['bridal', 'Plain silver', { 40: 1 }],
  ['bridal', 'Bridal red mix', { 37: 1, 38: 1, 39: 1 }],

  // Corporate: nude = 19
  ['corporate', 'Nude full', { 36: 1, 37: 2, 38: 3, 40: 5 }],
  ['corporate', 'Nude side', { 36: 2, 37: 1, 38: 1 }],
  ['corporate', 'Nude sling', { 38: 3, 39: 1 }],
  // Corporate: wine = 28
  ['corporate', 'Wine', { 36: 2, 37: 1, 38: 5, 39: 3, 40: 1, 41: 8 }],
  ['corporate', 'Burgundy', { 35: 1, 37: 1, 38: 3 }],
  ['corporate', 'Burgundy kitten', { 36: 1, 40: 1 }],
  ['corporate', 'Wine kitten', { 36: 1 }],
  // Corporate: black (list said 29, itemised lines add up to 23)
  ['corporate', 'Black', { 36: 3, 38: 3, 39: 3, 40: 3 }],
  ['corporate', 'Mirror black full', { 36: 2 }],
  ['corporate', 'Mirror black sling', { 36: 1, 38: 1, 39: 1, 40: 1 }],
  ['corporate', 'Black half', { 36: 1 }],
  ['corporate', 'Black cut sides', { 35: 1, 36: 1, 39: 1 }],
  ['corporate', 'Sling black', { 37: 1 }],

  // Other heels = 27 (not itemised on the list)
  ['other', 'Other heels (unsorted)', { [MIXED]: 27 }, 'not itemised'],

  // Zara = 56
  ['zara', 'Zara TwB', { 40: 1 }],
  ['zara', 'Zara BwB', { 35: 2, 36: 2, 37: 3, 38: 1 }],
  ['zara', 'Transparent with gold brooch', { 35: 1, 36: 3, 40: 1, 42: 2 }],
  ['zara', 'Half shoe gold', { 42: 2 }],
  ['zara', 'Black with silver bowtie', { 39: 1, 40: 1 }],
  ['zara', 'Mirror brown sling', { 38: 1 }],
  ['zara', 'Transparent with silver bowtie', { 37: 1, 38: 1, 40: 1 }],
  ['zara', 'Slipper heel transparent side brooch', { 40: 1 }],
  ['zara', 'Black sling', { 39: 2 }],
  ['zara', 'Brown sling', { 36: 3, 37: 1 }],
  ['zara', 'Brown half', { 36: 1, 40: 1, 41: 1 }],
  ['zara', 'Black half bowtie', { 37: 1 }],
  ['zara', 'Blue black slipper heel', { 40: 1 }],
  ['zara', 'Silver slipper heel', { 36: 1 }],
  ['zara', 'Leopard', { 36: 1 }],
  ['zara', 'Black sling net', { 36: 1, 37: 1, 38: 1, 39: 1, 42: 2 }],
  ['zara', 'Mirror nude sling', { 38: 1, 39: 1, 40: 1 }],
  ['zara', 'Black sling (2)', { 37: 1, 39: 2, 40: 2, 42: 2 }],
  ['zara', 'White sling', { 40: 1, 42: 1 }],

  // Mei = 6
  ['mei', 'Mei full black', { 36: 1, 38: 1, 39: 2, 40: 2 }],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const seed = {
  date: new Date(2026, 9, 26, 12).getTime(),
  purchaseDate: new Date(2026, 9, 24, 12).getTime(),
  supplier: 'Teemah',
  note: 'Bought 24 Oct 2026, stock taken 26 Oct 2026',
  categories,
  products: rows.map(([categoryId, name, sizes, mixedNote]) => ({
    id: `seed-${categoryId}-${slug(name)}`,
    categoryId,
    name,
    sizes: Object.fromEntries(Object.entries(sizes).map(([k, v]) => [String(k), v])),
    mixedNote: mixedNote || '',
  })),
};

export const seedTotal = seed.products.reduce(
  (a, p) => a + Object.values(p.sizes).reduce((x, y) => x + y, 0),
  0
);

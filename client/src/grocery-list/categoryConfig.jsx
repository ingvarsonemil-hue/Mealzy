import {
  CategoryProduce, CategoryProtein, CategoryDairy, CategoryGrains,
  CategoryPantry, CategoryFrozen, CategoryBeverages, CategoryOther
} from '@/components/icons';

/* Fixed render order — must match the legacy categoryConfig object's key
 * order exactly (produce -> protein -> dairy -> grains -> pantry -> frozen
 * -> beverages -> other). */
export const CATEGORY_CONFIG = [
  { key: 'produce', Icon: CategoryProduce, label: 'Produce & Vegetables' },
  { key: 'protein', Icon: CategoryProtein, label: 'Meat, Fish & Protein' },
  { key: 'dairy', Icon: CategoryDairy, label: 'Dairy & Eggs' },
  { key: 'grains', Icon: CategoryGrains, label: 'Bread, Grains & Pasta' },
  { key: 'pantry', Icon: CategoryPantry, label: 'Pantry & Condiments' },
  { key: 'frozen', Icon: CategoryFrozen, label: 'Frozen Foods' },
  { key: 'beverages', Icon: CategoryBeverages, label: 'Beverages' },
  { key: 'other', Icon: CategoryOther, label: 'Other Items' }
];

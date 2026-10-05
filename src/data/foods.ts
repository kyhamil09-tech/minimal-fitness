import { MORE_FOODS } from './foodsMore';

export interface FoodItem {
  name: string;
  serving: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

// Approximate values per serving (USDA-style averages). Good enough for everyday tracking;
// edit the entry after adding if your product differs.
const BASE_FOODS: FoodItem[] = [
  { name: 'Egg, large', serving: '1 egg', calories: 72, proteinG: 6.3, carbsG: 0.4, fatG: 4.8 },
  { name: 'Oatmeal, cooked', serving: '1 cup', calories: 154, proteinG: 6, carbsG: 27, fatG: 2.6 },
  { name: 'Greek yogurt, plain nonfat', serving: '170 g', calories: 100, proteinG: 17, carbsG: 6, fatG: 0.7 },
  { name: 'Banana', serving: '1 medium', calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4 },
  { name: 'Apple', serving: '1 medium', calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3 },
  { name: 'Blueberries', serving: '1 cup', calories: 84, proteinG: 1.1, carbsG: 21, fatG: 0.5 },
  { name: 'Whole wheat bread', serving: '1 slice', calories: 81, proteinG: 4, carbsG: 14, fatG: 1.1 },
  { name: 'White rice, cooked', serving: '1 cup', calories: 205, proteinG: 4.3, carbsG: 45, fatG: 0.4 },
  { name: 'Brown rice, cooked', serving: '1 cup', calories: 216, proteinG: 5, carbsG: 45, fatG: 1.8 },
  { name: 'Pasta, cooked', serving: '1 cup', calories: 220, proteinG: 8, carbsG: 43, fatG: 1.3 },
  { name: 'Chicken breast, grilled', serving: '100 g', calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
  { name: 'Salmon, baked', serving: '100 g', calories: 206, proteinG: 22, carbsG: 0, fatG: 12 },
  { name: 'Tuna, canned in water', serving: '100 g', calories: 116, proteinG: 26, carbsG: 0, fatG: 0.8 },
  { name: 'Ground beef 90% lean, cooked', serving: '100 g', calories: 217, proteinG: 26, carbsG: 0, fatG: 12 },
  { name: 'Tofu, firm', serving: '100 g', calories: 144, proteinG: 17, carbsG: 3, fatG: 9 },
  { name: 'Lentils, cooked', serving: '1 cup', calories: 230, proteinG: 18, carbsG: 40, fatG: 0.8 },
  { name: 'Black beans, cooked', serving: '1 cup', calories: 227, proteinG: 15, carbsG: 41, fatG: 0.9 },
  { name: 'Sweet potato, baked', serving: '1 medium', calories: 103, proteinG: 2.3, carbsG: 24, fatG: 0.2 },
  { name: 'Potato, baked', serving: '1 medium', calories: 161, proteinG: 4.3, carbsG: 37, fatG: 0.2 },
  { name: 'Broccoli, steamed', serving: '1 cup', calories: 55, proteinG: 3.7, carbsG: 11, fatG: 0.6 },
  { name: 'Spinach, raw', serving: '2 cups', calories: 14, proteinG: 1.7, carbsG: 2.2, fatG: 0.2 },
  { name: 'Avocado', serving: '1/2 fruit', calories: 120, proteinG: 1.5, carbsG: 6, fatG: 11 },
  { name: 'Almonds', serving: '28 g', calories: 164, proteinG: 6, carbsG: 6, fatG: 14 },
  { name: 'Peanut butter', serving: '2 tbsp', calories: 188, proteinG: 8, carbsG: 6, fatG: 16 },
  { name: 'Olive oil', serving: '1 tbsp', calories: 119, proteinG: 0, carbsG: 0, fatG: 13.5 },
  { name: 'Milk, 2%', serving: '1 cup', calories: 122, proteinG: 8, carbsG: 12, fatG: 4.8 },
  { name: 'Cheddar cheese', serving: '28 g', calories: 113, proteinG: 7, carbsG: 0.4, fatG: 9.3 },
  { name: 'Cottage cheese, low fat', serving: '1 cup', calories: 183, proteinG: 24, carbsG: 9, fatG: 5 },
  { name: 'Whey protein shake', serving: '1 scoop', calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5 },
  { name: 'Protein bar', serving: '1 bar', calories: 210, proteinG: 20, carbsG: 22, fatG: 7 },
  { name: 'Pizza, cheese', serving: '1 slice', calories: 285, proteinG: 12, carbsG: 36, fatG: 10 },
  { name: 'Hamburger, plain', serving: '1 sandwich', calories: 354, proteinG: 20, carbsG: 30, fatG: 17 },
  { name: 'Burrito, bean & cheese', serving: '1 burrito', calories: 380, proteinG: 14, carbsG: 54, fatG: 11 },
  { name: 'Caesar salad with chicken', serving: '1 bowl', calories: 440, proteinG: 33, carbsG: 15, fatG: 28 },
  { name: 'Granola bar', serving: '1 bar', calories: 130, proteinG: 2, carbsG: 20, fatG: 5 },
  { name: 'Dark chocolate', serving: '28 g', calories: 170, proteinG: 2, carbsG: 13, fatG: 12 },
  { name: 'Ice cream, vanilla', serving: '1/2 cup', calories: 137, proteinG: 2.3, carbsG: 16, fatG: 7.3 },
  { name: 'Orange juice', serving: '1 cup', calories: 112, proteinG: 1.7, carbsG: 26, fatG: 0.5 },
  { name: 'Coffee with milk', serving: '1 cup', calories: 30, proteinG: 1.5, carbsG: 2.5, fatG: 1.5 },
  { name: 'Beer', serving: '355 ml', calories: 153, proteinG: 1.6, carbsG: 13, fatG: 0 },
  { name: 'Red wine', serving: '150 ml', calories: 125, proteinG: 0.1, carbsG: 3.8, fatG: 0 },
];

export const FOOD_DATABASE: FoodItem[] = [...BASE_FOODS, ...MORE_FOODS];

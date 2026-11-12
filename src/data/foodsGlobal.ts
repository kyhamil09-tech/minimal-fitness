import type { FoodItem } from './foods';

// Plant-based, café, sports and international foods that the US government database covers thinly or not at all.
// These are typical values per serving, rounded, and brands differ: treat them as a starting point and use the barcode
// scanner (Open Food Facts) or "Create food" for an exact product.
export const GLOBAL_FOODS: FoodItem[] = [
  // Plant-based and dairy alternatives
  { name: 'Soy milk, unsweetened', serving: '1 cup (240 ml)', calories: 80, proteinG: 7, carbsG: 4, fatG: 4 },
  { name: 'Coconut milk drink, unsweetened', serving: '1 cup (240 ml)', calories: 45, proteinG: 0, carbsG: 1, fatG: 4.5 },
  { name: 'Greek yogurt, plain whole milk', serving: '1 container (170 g)', calories: 170, proteinG: 15, carbsG: 7, fatG: 9 },
  { name: 'Skyr, plain', serving: '1 container (150 g)', calories: 95, proteinG: 17, carbsG: 6, fatG: 0.3 },
  { name: 'Plant-based burger patty', serving: '1 patty (113 g)', calories: 240, proteinG: 19, carbsG: 8, fatG: 14 },
  { name: 'Veggie burger patty', serving: '1 patty (70 g)', calories: 125, proteinG: 11, carbsG: 11, fatG: 4 },
  // Protein and sports
  { name: 'Whey protein powder', serving: '1 scoop (30 g)', calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5 },
  { name: 'Protein shake, ready to drink', serving: '1 bottle (330 ml)', calories: 160, proteinG: 30, carbsG: 5, fatG: 3 },
  { name: 'Coconut water', serving: '1 cup (240 ml)', calories: 45, proteinG: 0.5, carbsG: 9, fatG: 0.5 },
  { name: 'Beef jerky', serving: '1 oz (28 g)', calories: 80, proteinG: 12, carbsG: 3, fatG: 1.5 },
  { name: 'Trail mix', serving: '1/4 cup (38 g)', calories: 175, proteinG: 5, carbsG: 16, fatG: 11 },
  // Café
  { name: 'Latte, 2% milk', serving: '16 oz (480 ml)', calories: 190, proteinG: 13, carbsG: 19, fatG: 7 },
  { name: 'Cappuccino', serving: '12 oz (355 ml)', calories: 120, proteinG: 8, carbsG: 10, fatG: 6 },
  { name: 'Cold brew coffee, black', serving: '1 cup (240 ml)', calories: 5, proteinG: 0, carbsG: 1, fatG: 0 },
  { name: 'Kombucha', serving: '1 bottle (240 ml)', calories: 30, proteinG: 0, carbsG: 7, fatG: 0 },
  { name: 'Avocado toast', serving: '1 slice', calories: 200, proteinG: 6, carbsG: 20, fatG: 12 },
  // Asian
  { name: 'Ramen, restaurant', serving: '1 bowl', calories: 500, proteinG: 20, carbsG: 65, fatG: 17 },
  { name: 'Pho, beef', serving: '1 bowl (600 g)', calories: 400, proteinG: 28, carbsG: 55, fatG: 6 },
  { name: 'Salmon nigiri', serving: '2 pieces', calories: 100, proteinG: 7, carbsG: 14, fatG: 2 },
  { name: 'Poke bowl, tuna', serving: '1 bowl (400 g)', calories: 600, proteinG: 30, carbsG: 70, fatG: 20 },
  { name: 'Bibimbap', serving: '1 bowl (500 g)', calories: 560, proteinG: 24, carbsG: 80, fatG: 16 },
  { name: 'Kimchi', serving: '1/2 cup (75 g)', calories: 12, proteinG: 0.8, carbsG: 2.4, fatG: 0.2 },
  { name: 'Miso soup', serving: '1 cup (240 ml)', calories: 40, proteinG: 3, carbsG: 5, fatG: 1 },
  { name: 'Banh mi sandwich', serving: '1 sandwich (250 g)', calories: 540, proteinG: 25, carbsG: 70, fatG: 17 },
  // South Asian
  { name: 'Chicken tikka masala', serving: '1 cup (240 g)', calories: 360, proteinG: 24, carbsG: 14, fatG: 22 },
  { name: 'Butter chicken', serving: '1 cup (240 g)', calories: 380, proteinG: 25, carbsG: 12, fatG: 25 },
  { name: 'Chana masala', serving: '1 cup (240 g)', calories: 270, proteinG: 12, carbsG: 38, fatG: 8 },
  { name: 'Dal, lentil, cooked', serving: '1 cup (240 g)', calories: 220, proteinG: 12, carbsG: 32, fatG: 5 },
  { name: 'Palak paneer', serving: '1 cup (240 g)', calories: 280, proteinG: 14, carbsG: 12, fatG: 20 },
  { name: 'Chicken biryani', serving: '1 cup (200 g)', calories: 290, proteinG: 14, carbsG: 38, fatG: 9 },
  { name: 'Samosa, vegetable', serving: '1 piece (50 g)', calories: 130, proteinG: 2.5, carbsG: 15, fatG: 7 },
  { name: 'Naan', serving: '1 piece (90 g)', calories: 260, proteinG: 9, carbsG: 45, fatG: 5 },
  // Middle Eastern, African, European
  { name: 'Falafel', serving: '3 patties (51 g)', calories: 170, proteinG: 6.5, carbsG: 16, fatG: 9 },
  { name: 'Chicken shawarma wrap', serving: '1 wrap', calories: 550, proteinG: 35, carbsG: 48, fatG: 24 },
  { name: 'Jollof rice', serving: '1 cup (200 g)', calories: 280, proteinG: 5, carbsG: 45, fatG: 8 },
  { name: 'Schnitzel, breaded', serving: '1 piece (150 g)', calories: 360, proteinG: 25, carbsG: 18, fatG: 20 },
];

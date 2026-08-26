// Fallback sample meals — used by dashboard-actions.js's swapMeal() when the
// server can't produce a replacement. Pulled out of dashboard-today.js to keep
// that file under the 500-line limit.
function getSampleMeals() {
  return [
    {
      type: 'breakfast', name: 'Greek Yogurt Parfait', completed: false,
      description: 'Creamy Greek yogurt layered with fresh berries and crunchy granola',
      calories: 380, protein: 22, carbs: 42, fat: 8, cookTime: 5, estimatedCost: 3.50,
      ingredients: [
        { name: 'Greek yogurt', amount: '200g', cost: 1.80 },
        { name: 'Mixed berries', amount: '100g', cost: 1.20 },
        { name: 'Granola', amount: '50g', cost: 0.50 }
      ],
      instructions: [
        'Spoon Greek yogurt into a bowl or glass.',
        'Layer with fresh mixed berries.',
        'Top with granola and a drizzle of honey.',
        'Serve immediately and enjoy!'
      ]
    },
    {
      type: 'lunch', name: 'Grilled Chicken & Avocado Bowl', completed: false,
      description: 'Tender grilled chicken over brown rice with avocado and lime dressing',
      calories: 520, protein: 45, carbs: 38, fat: 16, cookTime: 20, estimatedCost: 6.50,
      ingredients: [
        { name: 'Chicken breast', amount: '180g', cost: 3.50 },
        { name: 'Brown rice', amount: '80g dry', cost: 0.40 },
        { name: 'Avocado', amount: '1/2', cost: 1.00 },
        { name: 'Cherry tomatoes', amount: '100g', cost: 0.80 },
        { name: 'Lime', amount: '1', cost: 0.30 }
      ],
      instructions: [
        'Cook rice according to package instructions.',
        'Season chicken with salt, pepper, garlic powder.',
        'Grill chicken 6-7 minutes per side until cooked through.',
        'Slice chicken and arrange over rice.',
        'Top with sliced avocado and tomatoes.',
        'Squeeze lime juice over everything and serve.'
      ]
    },
    {
      type: 'snack', name: 'Apple with Almond Butter', completed: false,
      description: 'Crisp apple slices paired with creamy almond butter for sustained energy',
      calories: 210, protein: 6, carbs: 28, fat: 10, cookTime: 2, estimatedCost: 1.80,
      ingredients: [
        { name: 'Apple', amount: '1 medium', cost: 0.80 },
        { name: 'Almond butter', amount: '2 tbsp', cost: 1.00 }
      ],
      instructions: [
        'Wash and slice the apple into wedges.',
        'Serve with almond butter for dipping.'
      ]
    },
    {
      type: 'dinner', name: 'Baked Salmon with Roasted Broccoli', completed: false,
      description: 'Herb-crusted salmon fillet with garlicky roasted broccoli and lemon',
      calories: 480, protein: 48, carbs: 18, fat: 22, cookTime: 30, estimatedCost: 9.00,
      ingredients: [
        { name: 'Salmon fillet', amount: '200g', cost: 5.50 },
        { name: 'Broccoli', amount: '200g', cost: 1.20 },
        { name: 'Olive oil', amount: '1 tbsp', cost: 0.30 },
        { name: 'Garlic', amount: '3 cloves', cost: 0.20 },
        { name: 'Lemon', amount: '1', cost: 0.40 },
        { name: 'Fresh dill', amount: '1 tbsp', cost: 0.40 }
      ],
      instructions: [
        'Preheat oven to 200°C (400°F).',
        'Toss broccoli with olive oil, minced garlic, salt and pepper.',
        'Roast broccoli for 15 minutes.',
        'Place salmon on a lined baking sheet, season with dill, salt, and lemon zest.',
        'Bake salmon alongside broccoli for 12-15 minutes.',
        'Serve with lemon wedges and enjoy!'
      ]
    }
  ];
}

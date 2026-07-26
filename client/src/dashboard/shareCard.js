/* Canvas-based "Share Card" PNG generator — ported 1:1 from legacy
 * generateShareCard() in public/dashboard.html. This draws a downloadable
 * image (not app chrome), so its emoji content is left exactly as it was in
 * the legacy canvas drawing rather than following the app's no-emoji UI
 * convention — see DashboardPage judgment-call notes. */
export function downloadShareCard(todayMeals) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#1a4731');
  grad.addColorStop(1, '#2e7d4f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(canvas.width - 80, 120, 320, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 68px Arial, sans-serif';
  ctx.fillText('🥗 Mealzy', 80, 130);

  ctx.font = '400 34px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('My AI meal plan — powered by mealzy.org', 80, 190);

  if (todayMeals && todayMeals.length > 0) {
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText("TODAY'S MEALS", 80, 290);
    const icons = ['🌅', '☀️', '🍎', '🌙'];
    todayMeals.slice(0, 4).forEach((meal, i) => {
      ctx.font = 'bold 40px Arial, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${icons[i] || '🍽️'}  ${meal.name}`, 80, 370 + i * 130);
      ctx.font = '400 26px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`   ${meal.calories} kcal · ${meal.protein}g protein`, 80, 415 + i * 130);
    });
  } else {
    ctx.font = 'bold 56px Arial, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('Eating healthy,', 80, 420);
    ctx.fillText('effortlessly. ✨', 80, 500);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(80, canvas.height - 195, canvas.width - 160, 1);

  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('Try it free → mealzy.org', 80, canvas.height - 130);
  ctx.font = '400 24px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Powered by Mealzy · AI Meal Planning', 80, canvas.height - 80);

  const a = document.createElement('a');
  a.download = 'mealzy-meal-plan.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

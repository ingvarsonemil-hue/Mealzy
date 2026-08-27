# Mealzy Privacy Policy

Last updated: June 2026. This is a plain-language summary of the full policy at
https://mealzy.org/privacy-policy.html — the HTML page is the authoritative
version.

## What data is collected

- Your name and email address when you create an account.
- Your dietary profile: goals, calorie targets, allergies, dietary preferences,
  budget, and cooking preferences.
- Meal plans you generate and save.
- Basic usage events (page views, plan generations) for analytics, stored in
  Mealzy's own database and not shared with third parties.
- A truncated partial IP address (last 8 characters only), for abuse prevention
  and basic analytics. Full IP addresses are not retained.

## How it is used

- To generate personalized meal plans via Anthropic's Claude API. Your name and
  email are never sent to Anthropic, and Anthropic does not use API inputs to
  train models by default.
- To maintain your account and remember preferences.
- To send transactional emails (password reset, plan reminders) if you opt in.
- To improve the product from aggregated, anonymous usage patterns.
- To enforce the free-plan limit.

## Third parties

- **Stripe** processes payments. Card numbers never reach Mealzy.
- **Google Analytics** loads only after you accept analytics cookies. It does not
  receive your dietary profile or meal plan content.
- One httpOnly session cookie (a JWT) keeps you signed in. No tracking cookies
  are set before consent.

## Hosting

Application server on Render (US, Oregon). Database on Turso/libSQL, hosted on AWS
eu-west-1 (Ireland). EEA/UK account and profile data are stored in the EU;
processing and logs may pass through US infrastructure.

## Your rights

Mealzy does not sell, rent, or share personal data for marketing. Request full
deletion of your account and data by emailing support@mealzy.org; deletion
happens within 30 days.

## Contact

Questions about this policy: support@mealzy.org

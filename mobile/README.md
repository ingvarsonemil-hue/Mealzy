# Mealzy Mobile

Native iOS and Android app for Mealzy, built with Expo (SDK 57) and Expo Router.

This checkpoint (M2) is an application shell only. It contains the tab
navigation and placeholder screens for the five primary destinations: Plan,
Shop, Eat, History, Settings. No feature logic, data, auth, or persistence yet.

## Develop

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm start
   ```

   Then open the app on an iOS simulator, Android emulator, or a device using
   the Expo Go app or a development build.

## Structure

- `src/app/` route files (Expo Router, file-based routing)
- `src/components/` shared UI components
- `src/constants/` static values such as colors and spacing

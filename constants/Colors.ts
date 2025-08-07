/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 * 
 * This file defines our app's color scheme for both light and dark themes
 * We use a consistent color palette throughout the app for better user experience
 */

// Main brand colors for light and dark modes
const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

/**
 * Color definitions for the entire app
 * Light mode uses dark text on light backgrounds
 * Dark mode uses light text on dark backgrounds
 * This ensures good readability in both themes
 */
export const Colors = {
  light: {
    text: '#11181C', // Dark text for good contrast on light background
    background: '#fff', // Clean white background
    tint: tintColorLight, // Brand blue color for highlights
    icon: '#687076', // Subtle gray for icons
    tabIconDefault: '#687076', // Default tab icon color
    tabIconSelected: tintColorLight, // Selected tab icon color
  },
  dark: {
    text: '#ECEDEE', // Light text for good contrast on dark background
    background: '#151718', // Dark background for easy reading
    tint: tintColorDark, // White tint for dark mode
    icon: '#9BA1A6', // Light gray for icons in dark mode
    tabIconDefault: '#9BA1A6', // Default tab icon color in dark mode
    tabIconSelected: tintColorDark, // Selected tab icon color in dark mode
  },
};

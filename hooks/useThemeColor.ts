/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 * 
 * This hook helps manage theme colors throughout the app
 * It automatically picks the right color based on current theme
 */

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

/**
 * Custom hook for getting theme-appropriate colors
 * Returns the color that matches the current theme (light or dark)
 * Falls back to default colors if no custom color is provided
 * 
 * @param props - Object with optional light and dark color values
 * @param colorName - Name of the color to get from the theme
 * @returns The appropriate color for the current theme
 */
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light'; // Default to light theme if none detected
  const colorFromProps = props[theme];

  if (colorFromProps) {
    // Use custom color if provided for this theme
    return colorFromProps;
  } else {
    // Fall back to default theme color
    return Colors[theme][colorName];
  }
}

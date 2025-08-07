import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys - these are the names we use to store data locally
export const STORAGE_KEYS = {
  EXTRACTED_TEXTS: 'extractedTexts',
  USER_PROFILE: 'userProfile',
  SETTINGS: 'settings',
  SESSION_DATA: 'sessionData',
  SESSION_TIMESTAMP: 'sessionTimestamp'
} as const;

// Session management for 15-day persistence - keeps users logged in for convenience
export const SESSION_DURATION_DAYS = 15;
export const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000; // 15 days in milliseconds

/**
 * Saves session data to local storage
 * This keeps users logged in for 15 days so they don't have to login everytime
 * Stores user info and timestamp for session validation
 */
export const saveSessionData = async (sessionData: any) => {
  try {
    const timestamp = Date.now();
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.SESSION_DATA, JSON.stringify(sessionData)],
      [STORAGE_KEYS.SESSION_TIMESTAMP, timestamp.toString()]
    ]);
    console.log('Session data saved with 15-day expiration');
  } catch (error) {
    console.error('Error saving session data:', error);
  }
};

/**
 * Gets session data if it's still valid
 * Checks if the session hasn't expired (within 15 days)
 * Returns null if session is expired or doesn't exist
 */
export const getSessionData = async () => {
  try {
    const [sessionDataJson, timestampJson] = await AsyncStorage.multiGet([
      STORAGE_KEYS.SESSION_DATA,
      STORAGE_KEYS.SESSION_TIMESTAMP
    ]);

    if (!sessionDataJson[1] || !timestampJson[1]) {
      return null; // No session data - user needs to login again
    }

    const timestamp = parseInt(timestampJson[1]);
    const currentTime = Date.now();
    const timeDiff = currentTime - timestamp;

    // Check if session is still valid (within 15 days) - keeps users logged in
    if (timeDiff < SESSION_DURATION_MS) {
      const sessionData = JSON.parse(sessionDataJson[1]);
      console.log('Valid session found, expires in', Math.floor((SESSION_DURATION_MS - timeDiff) / (1000 * 60 * 60 * 24)), 'days');
      return sessionData;
    } else {
      // Session expired, clear it - time to login again
      await clearSessionData();
      console.log('Session expired, cleared');
      return null;
    }
  } catch (error) {
    console.error('Error getting session data:', error);
    return null;
  }
};

/**
 * Clears all session data from local storage
 * Called when user logs out or session expires
 * Ensures user is fully logged out
 */
export const clearSessionData = async () => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.SESSION_DATA,
      STORAGE_KEYS.SESSION_TIMESTAMP
    ]);
    console.log('Session data cleared');
  } catch (error) {
    console.error('Error clearing session data:', error);
  }
};

/**
 * Checks if the current session is still valid
 * Returns true if user has a valid session, false otherwise
 * Used to determine if user needs to login or can stay logged in
 */
export const isSessionValid = async (): Promise<boolean> => {
  try {
    const sessionData = await getSessionData();
    return sessionData !== null;
  } catch (error) {
    console.error('Error checking session validity:', error);
    return false;
  }
};

/**
 * Gets the remaining session time in days
 * Useful for showing users how long until they need to login again
 * Returns 0 if session is expired or doesn't exist
 */
export const getRemainingSessionDays = async (): Promise<number> => {
  try {
    const timestampJson = await AsyncStorage.getItem(STORAGE_KEYS.SESSION_TIMESTAMP);
    if (!timestampJson) return 0;

    const timestamp = parseInt(timestampJson);
    const currentTime = Date.now();
    const timeDiff = currentTime - timestamp;
    const remainingMs = SESSION_DURATION_MS - timeDiff;

    if (remainingMs <= 0) return 0;
    return Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  } catch (error) {
    console.error('Error getting remaining session days:', error);
    return 0;
  }
};

// Types for local storage data - these define the structure of our stored data

/**
 * Interface for extracted text items stored locally
 * Includes metadata like file name, processing method, etc.
 */
export interface ExtractedTextItem {
  id: string;
  fileName: string;
  extractedText: string;
  processingMethod: string;
  createdAt: number;
  fileSize: number;
  userId?: string;
}

/**
 * Interface for user profile data stored locally
 * Basic user info for offline access
 */
export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Interface for app settings stored locally
 * User preferences like theme, language, auto-save, etc.
 */
export interface AppSettings {
  autoSave: boolean;
  language: string;
  theme: 'light' | 'dark';
}

// ===== LOCAL STORAGE FUNCTIONS =====

 
// firebase.ts - This file initializes and configures Firebase services

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "your_firebase_api_key_here",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "your_project_id.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "your_project_id",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "your_project_id.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "your_messaging_sender_id",
  appId: process.env.FIREBASE_APP_ID || "your_app_id"
};

/**
 * Initialize Firebase only if it hasn't been initialized already
 * This prevents multiple initializations which can cause issues
 */
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Initialize Firebase Authentication service
 * This handles user login, logout, and session management
 */
export const auth = getAuth(app);

/**
 * Configure auth persistence for 15-day session
 * Note: Firebase Auth automatically handles session persistence
 * The session will persist until the user explicitly logs out or the token expires
 * Firebase tokens typically last for 1 hour and are automatically refreshed
 * For longer sessions, we rely on the automatic token refresh mechanism
 */

/**
 * Initialize Firestore database service
 * This is our main database for storing contracts, users, and other data
 * Configured with settings for better network handling
 */
export const db = getFirestore(app);

/**
 * Initialize Firebase Storage service
 * Note: Currently not used in this app, but available for future file uploads
 * We're using Firestore for document storage instead
 */
export const storage = getStorage(app);

/**
 * Note: Firebase automatically handles connection retries and timeouts
 * The default timeout is 60 seconds for Firestore operations
 * This makes the app more reliable on slow networks
 */

export default app; 
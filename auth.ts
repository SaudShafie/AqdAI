import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User
} from 'firebase/auth';
import { auth } from './firebase';
import { getUserDocument } from './firebaseServices';
import { clearSessionData, getSessionData, saveSessionData } from './localStorage';

// Extended user type with Firestore data - this combines Firebase Auth user with our custom user data
export interface ExtendedUser extends User {
  userData?: {
    fullName: string;
    email: string;
    phone?: string;
    role: 'standalone' | 'org_user' | 'legal_assistant' | 'admin' | 'creator' | 'viewer';
    organizationId?: string | null;
    status: 'pending' | 'approved' | 'rejected';
    language: 'en' | 'ar';
  };
}

/**
 * Creates a new user account in Firebase Auth
 * This is the main registration function that handles user signup
 * It also handles various error cases and provides user-friendly error messages
 */
export const register = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    // Convert Firebase error codes to user-friendly messages - makes errors easier to understand
    let userMessage = 'Registration failed. Please try again.';
    
    switch (error.code) {
      case 'auth/email-already-in-use':
        userMessage = 'An account with this email already exists. Please use a different email or try logging in.';
        break;
      case 'auth/invalid-email':
        userMessage = 'Please enter a valid email address.';
        break;
      case 'auth/weak-password':
        userMessage = 'Password is too weak. Please use at least 6 characters.';
        break;
      case 'auth/operation-not-allowed':
        userMessage = 'Registration is currently disabled. Please contact support.';
        break;
      case 'auth/network-request-failed':
        userMessage = 'Network error. Please check your internet connection and try again.';
        break;
      default:
        userMessage = 'Registration failed. Please check your information and try again.';
    }
    
    throw new Error(userMessage);
  }
};

/**
 * Logs in a user with email and password
 * Also saves session data for 15-day persistence so users don't have to login everytime
 * Handles various login errors and provides helpful error messages
 */
export const login = async (email: string, password: string) => {
  try {
    console.log('Auth: Attempting login for:', email);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Auth: Login successful, user:', userCredential.user.email);
    
    // Save session data for 15-day persistence - keeps users logged in for convenience
    const sessionData = {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      loginTime: Date.now()
    };
    await saveSessionData(sessionData);
    
    // Firebase Auth automatically handles session persistence
    // The session will persist for up to 15 days or until the user logs out
    // Tokens are automatically refreshed in the background
    
    return userCredential.user;
  } catch (error: any) {
    // Convert Firebase error codes to user-friendly messages - makes errors easier to understand
    let userMessage = 'Login failed. Please try again.';
    
    switch (error.code) {
      case 'auth/user-not-found':
        userMessage = 'No account found with this email address. Please check your email or register a new account.';
        break;
      case 'auth/wrong-password':
        userMessage = 'Incorrect password. Please check your password and try again.';
        break;
      case 'auth/invalid-email':
        userMessage = 'Please enter a valid email address.';
        break;
      case 'auth/user-disabled':
        userMessage = 'This account has been disabled. Please contact support.';
        break;
      case 'auth/too-many-requests':
        userMessage = 'Too many failed login attempts. Please wait a few minutes before trying again.';
        break;
      case 'auth/network-request-failed':
        userMessage = 'Network error. Please check your internet connection and try again.';
        break;
      case 'auth/invalid-credential':
        userMessage = 'Invalid email or password. Please check your credentials and try again.';
        break;
      default:
        userMessage = 'Login failed. Please check your email and password and try again.';
    }
    
    throw new Error(userMessage);
  }
};

/**
 * Logs out the current user and clears all session data
 * This ends the user's session and removes them from the app
 */
export const logout = async () => {
  try {
    await signOut(auth);
    await clearSessionData(); // Clear local session data - makes sure user is fully logged out
    console.log('Auth: User logged out successfully');
  } catch (error: any) {
    throw new Error(error.message);
  }
};

/**
 * Gets the current authenticated user from Firebase Auth
 * Returns null if no user is currently logged in
 */
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

/**
 * Gets the current user with their Firestore data included
 * This combines Firebase Auth user with our custom user profile data
 * Useful for getting user roles, organization info, etc.
 */
export const getCurrentUserWithData = async (): Promise<ExtendedUser | null> => {
  const user = auth.currentUser;
  if (!user) {
    // Check if we have a valid session in local storage - sometimes Firebase Auth gets out of sync
    const sessionData = await getSessionData();
    if (sessionData) {
      console.log('Auth: Found valid session data, user should be logged in');
    }
    return null;
  }

  try {
    const userData = await getUserDocument(user.uid);
    if (userData) {
      return {
        ...user,
        userData
      } as ExtendedUser;
    }
    return user as ExtendedUser;
  } catch (error) {
    console.error('Failed to get user data:', error);
    // Return user without data if Firestore is offline - better than crashing the app
    console.log('Returning user without Firestore data due to offline status');
    return user as ExtendedUser;
  }
};

/**
 * Sets up a listener for authentication state changes
 * This is used in the main App component to detect when users login/logout
 * The callback function gets called whenever the auth state changes
 */
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
}; 
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { getCurrentUserWithData } from './auth';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "your_firebase_api_key_here",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "your_project_id.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "your_project_id",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "your_project_id.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "your_messaging_sender_id",
  appId: process.env.FIREBASE_APP_ID || "your_app_id"
};

// Initialize Firebase only if it hasn't been initialized already - prevents multiple initializations
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase services - these are the main services we use throughout the app
export const auth = getAuth(app);
export const db = getFirestore(app);

// ===== FIRESTORE FUNCTIONS =====

/**
 * Adds a new document to any Firestore collection
 * This is a generic function that can be used for any collection
 * Automatically adds timestamps and user ID to the document
 */
export const addDocument = async (collectionName: string, data: any) => {
  try {
    const docRef = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      userId: auth.currentUser?.uid || null
    });
    return docRef;
  } catch (error: any) {
    throw new Error(`Failed to add document: ${error.message}`);
  }
};

/**
 * Gets all documents from a Firestore collection
 * Returns an array of documents with their IDs included
 * Useful for getting lists of data like contracts, users, etc.
 */
export const getDocuments = async (collectionName: string) => {
  try {
    const querySnapshot = await getDocs(collection(db, collectionName));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error: any) {
    throw new Error(`Failed to get documents: ${error.message}`);
  }
};

/**
 * Gets documents from a collection with filtering
 * This is useful for getting specific data like contracts for a user
 * You can filter by any field in the document
 */
export const getDocumentsWithFilter = async (
  collectionName: string, 
  field: string, 
  operator: any, 
  value: any
) => {
  try {
    const q = query(
      collection(db, collectionName), 
      where(field, operator, value)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error: any) {
    throw new Error(`Failed to get filtered documents: ${error.message}`);
  }
};

/**
 * Gets a single document by its ID
 * Returns the document data with the ID included
 * Throws an error if the document doesn't exist
 */
export const getDocument = async (collectionName: string, docId: string) => {
  try {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      throw new Error('Document not found');
    }
  } catch (error: any) {
    throw new Error(`Failed to get document: ${error.message}`);
  }
};

/**
 * Updates an existing document in Firestore
 * Automatically adds an updatedAt timestamp
 * Useful for updating user profiles, contract status, etc.
 */
export const updateDocument = async (
  collectionName: string, 
  docId: string, 
  data: any
) => {
  try {
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now()
    });
  } catch (error: any) {
    throw new Error(`Failed to update document: ${error.message}`);
  }
};

// ===== SPECIFIC APP FUNCTIONS =====

/**
 * Saves extracted text from documents to Firestore
 * This is the main function for storing OCR results and document analysis
 * Each document gets saved with metadata like processing method, file size, etc.
 */
export const saveExtractedText = async (
  fileName: string, 
  extractedText: string, 
  processingMethod: string
) => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      console.warn('User not authenticated, skipping save to Firestore');
      return null; // Return null instead of throwing error - better UX
    }

    const docData = {
      fileName,
      extractedText,
      processingMethod,
      userId,
      fileSize: extractedText.length,
      language: 'auto-detected', // You can add language detection logic here later
      createdAt: Timestamp.now()
    };

    const docRef = await addDocument('extractedTexts', docData);
    return docRef;
  } catch (error: any) {
    console.error('Failed to save extracted text:', error);
    // Don't throw error, just log it - prevents app crashes
    return null;
  }
};

/**
 * Gets all extracted texts for the current user
 * Returns an array of documents that the user has processed
 * Useful for showing user's document history
 */
export const getUserExtractedTexts = async () => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      console.warn('User not authenticated, returning empty array');
      return [];
    }

    return await getDocumentsWithFilter('extractedTexts', 'userId', '==', userId);
  } catch (error: any) {
    console.error('Failed to get user texts:', error);
    
    // Check if it's a permissions error - helps with debugging
    if (error.message.includes('Missing or insufficient permissions')) {
      console.warn('Firestore permissions issue - check Firestore rules');
      return [];
    }
    
    return [];
  }
};

/**
 * Saves a user profile to Firestore
 * Creates a new profile or updates an existing one
 * Useful for storing user preferences, roles, organization info, etc.
 */
export const saveUserProfile = async (profileData: any) => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const docData = {
      ...profileData,
      userId,
      updatedAt: Timestamp.now()
    };

    // Check if profile exists - if it does, update it; if not, create new one
    const existingProfiles = await getDocumentsWithFilter('userProfiles', 'userId', '==', userId);
    
    if (existingProfiles.length > 0) {
      // Update existing profile
      await updateDocument('userProfiles', existingProfiles[0].id, docData);
      return existingProfiles[0].id;
    } else {
      // Create new profile
      const docRef = await addDocument('userProfiles', docData);
      return docRef.id;
    }
  } catch (error: any) {
    throw new Error(`Failed to save user profile: ${error.message}`);
  }
};

/**
 * Gets the current user's profile from Firestore
 * Returns null if no profile exists
 * Useful for getting user roles, organization info, etc.
 */
export const getUserProfile = async () => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const profiles = await getDocumentsWithFilter('userProfiles', 'userId', '==', userId);
    return profiles.length > 0 ? profiles[0] : null;
  } catch (error: any) {
    throw new Error(`Failed to get user profile: ${error.message}`);
  }
}; 

 

// ===== USER MANAGEMENT FUNCTIONS =====

// User roles and types - these define what different users can do in the app
export type UserRole = 'standalone' | 'org_user' | 'legal_assistant' | 'admin' | 'creator' | 'viewer';
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type UserLanguage = 'en' | 'ar';

// User interface - this defines what data we store for each user
export interface User {
  fullName: string;
  email: string;
  phone?: string;
  role: UserRole;
  organizationId?: string | null;
  status: UserStatus;
  createdAt: Timestamp;
  language: UserLanguage;
}

// User with ID interface - useful when we need the document ID along with user data
export interface UserWithId extends User {
  id: string;
}

// Organization interface - for multi-tenant organizations
export interface Organization {
  name: string;
  code: string;
  createdBy: string;
  createdAt: Timestamp;
}

// Contract interface - this defines what data we store for each contract
export interface Contract {
  title: string;
  fileUrl?: string;
  fileName?: string;
  uploadedBy: string;
  organizationId?: string | null;
  status: 'uploaded' | 'analyzed' | 'assigned' | 'reviewed' | 'approved' | 'rejected';
  category?: string;
  extractedClauses?: any[];
  summary?: string;
  assignedTo?: string | null;
  approvedBy?: string | null;
  riskLevel?: string;
  createdAt: Timestamp;
  approvalComment?: string;
  assignedAt?: Timestamp;
  deadline?: Timestamp; // Added deadline field for contract deadlines
}

// Category interface - for organizing contracts into categories
export interface Category {
  name: string;
  createdBy: string;
  organizationId?: string | null;
}

// Notification interface - for system notifications to users
export interface Notification {
  userId: string;
  contractId?: string;
  message: string;
  type: 'status-update' | 'assignment' | 'approval';
  read: boolean;
  createdAt: Timestamp;
}

// Comment interface - for comments on contracts
export interface Comment {
  id: string;
  contractId: string;
  userId: string;
  userName: string;
  userRole: string;
  message: string;
  createdAt: Timestamp;
  isAdminComment: boolean;
}

/**
 * Creates a new user document in Firestore
 * This is called when a user registers for the first time
 * Sets up the initial user profile with default values
 */
export const createUserDocument = async (userId: string, userData: Partial<User>): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc: User = {
      fullName: userData.fullName || '',
      email: userData.email || '',
      phone: userData.phone || '',
      role: userData.role || 'standalone',
      organizationId: userData.organizationId || null,
      status: userData.status || 'pending',
      createdAt: Timestamp.now(),
      language: userData.language || 'en'
    };
    
    await setDoc(userRef, userDoc);
    console.log('User document created successfully:', userId);
  } catch (error: any) {
    console.error('Failed to create user document:', error);
    throw new Error(`Failed to create user document: ${error.message}`);
  }
};

/**
 * Gets a user document from Firestore by user ID
 * Returns null if the user document doesn't exist
 * Useful for getting user profile data like roles, organization info, etc.
 */
export const getUserDocument = async (userId: string): Promise<User | null> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data() as User;
    } else {
      console.log('User document not found:', userId);
      return null;
    }
  } catch (error: any) {
    console.error('Failed to get user document:', error);
    throw new Error(`Failed to get user document: ${error.message}`);
  }
};

/**
 * Updates an existing user document in Firestore
 * Useful for updating user roles, status, organization info, etc.
 * Only updates the fields you provide, leaves others unchanged
 */
export const updateUserDocument = async (userId: string, updates: Partial<User>): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, updates);
    console.log('User document updated successfully:', userId);
  } catch (error: any) {
    console.error('Failed to update user document:', error);
    throw new Error(`Failed to update user document: ${error.message}`);
  }
};

/**
 * Creates a new organization in Firestore
 * This is used when setting up multi-tenant organizations
 * Returns the organization ID for future reference
 */
export const createOrganization = async (orgData: Partial<Organization>): Promise<string> => {
  try {
    const orgRef = collection(db, 'organizations');
    const orgDoc: Organization = {
      name: orgData.name || '',
      code: orgData.code || '',
      createdBy: orgData.createdBy || '',
      createdAt: Timestamp.now()
    };
    
    const docRef = await addDoc(orgRef, orgDoc);
    console.log('Organization created successfully:', docRef.id);
    return docRef.id;
  } catch (error: any) {
    console.error('Failed to create organization:', error);
    throw new Error(`Failed to create organization: ${error.message}`);
  }
};

/**
 * Gets an organization by its unique code
 * This is used when users join organizations using organization codes
 * Returns null if no organization is found with that code
 */
export const getOrganizationByCode = async (code: string): Promise<Organization & { id: string } | null> => {
  try {
    const orgRef = collection(db, 'organizations');
    const q = query(orgRef, where('code', '==', code));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() } as Organization & { id: string };
    } else {
      console.log('Organization not found with code:', code);
      return null;
    }
  } catch (error: any) {
    console.error('Failed to get organization by code:', error);
    throw new Error(`Failed to get organization by code: ${error.message}`);
  }
};

/**
 * Creates a new contract document in Firestore
 * This is the main function for saving contract data after upload
 * Includes all the metadata like title, file info, status, etc.
 */
export const createContractDocument = async (contractData: Partial<Contract>): Promise<string> => {
  try {
    const contractRef = collection(db, 'contracts');
    const contractDoc: Contract = {
      title: contractData.title || '',
      fileUrl: contractData.fileUrl || '',
      fileName: contractData.fileName || '',
      uploadedBy: contractData.uploadedBy || '',
      organizationId: contractData.organizationId || null,
      status: contractData.status || 'uploaded',
      category: contractData.category || '',
      extractedClauses: contractData.extractedClauses || [],
      summary: contractData.summary || '',
      assignedTo: contractData.assignedTo || null,
      approvedBy: contractData.approvedBy || null,
      riskLevel: contractData.riskLevel || '',
      createdAt: Timestamp.now()
    };
    
    const docRef = await addDoc(contractRef, contractDoc);
    console.log('Contract document created successfully:', docRef.id);
    return docRef.id;
  } catch (error: any) {
    console.error('Failed to create contract document:', error);
    throw new Error(`Failed to create contract document: ${error.message}`);
  }
};

/**
 * Creates a new category for organizing contracts
 * Categories help users organize their contracts better
 * Returns the category ID for future reference
 */
export const createCategory = async (categoryData: Partial<Category>): Promise<string> => {
  try {
    const categoryRef = collection(db, 'categories');
    const categoryDoc: Category = {
      name: categoryData.name || '',
      createdBy: categoryData.createdBy || '',
      organizationId: categoryData.organizationId || null
    };
    
    const docRef = await addDoc(categoryRef, categoryDoc);
    console.log('Category created successfully:', docRef.id);
    return docRef.id;
  } catch (error: any) {
    console.error('Failed to create category:', error);
    throw new Error(`Failed to create category: ${error.message}`);
  }
};

/**
 * Creates a new notification for users
 * Notifications are used to inform users about contract updates, assignments, etc.
 * Useful for keeping users informed about important changes
 */
export const createNotification = async (notificationData: Partial<Notification>): Promise<string> => {
  try {
    const notificationRef = collection(db, 'notifications');
    const notificationDoc: Notification = {
      userId: notificationData.userId || '',
      contractId: notificationData.contractId || '',
      message: notificationData.message || '',
      type: notificationData.type || 'status-update',
      read: notificationData.read || false,
      createdAt: Timestamp.now()
    };
    
    const docRef = await addDoc(notificationRef, notificationDoc);
    console.log('Notification created successfully:', docRef.id);
    return docRef.id;
  } catch (error: any) {
    console.error('Failed to create notification:', error);
    throw new Error(`Failed to create notification: ${error.message}`);
  }
}; 

/**
 * Updates the status of a contract
 * This is used throughout the approval workflow
 * Can also record who approved/rejected the contract
 */
export const updateContractStatus = async (contractId: string, status: string, approvedBy?: string): Promise<void> => {
  try {
    const contractRef = doc(db, 'contracts', contractId);
    const updateData: any = { status };
    
    if (approvedBy) {
      updateData.approvedBy = approvedBy;
    }
    
    await updateDoc(contractRef, updateData);
    console.log('Contract status updated successfully:', contractId, status);
  } catch (error: any) {
    console.error('Failed to update contract status:', error);
    throw new Error(`Failed to update contract status: ${error.message}`);
  }
};

/**
 * Gets contracts based on user role and permissions
 * Different user roles see different contracts:
 * - Standalone users see only their own contracts
 * - Legal assistants see contracts assigned to them
 * - Org users see contracts from their organization
 * - Admins see all contracts in their organization
 */
export const getContractsByUser = async (userId: string, userRole: string, organizationId?: string): Promise<any[]> => {
  try {
    const contractsRef = collection(db, 'contracts');
    let q;

    if (userRole === 'standalone') {
      // Standalone users see only their own contracts - simple and straightforward
      q = query(contractsRef, where('uploadedBy', '==', userId));
    } else if (userRole === 'legal_assistant') {
      // Legal assistants see contracts assigned to them - they review what's assigned
      q = query(contractsRef, where('assignedTo', '==', userId));
    } else if (userRole === 'org_user' && organizationId) {
      // Org users see contracts from their organization - they see company contracts
      q = query(contractsRef, where('organizationId', '==', organizationId));
    } else if ((userRole === 'admin' || userRole === 'creator') && organizationId) {
      // Admins and creators see all contracts in their organization - full oversight
      q = query(contractsRef, where('organizationId', '==', organizationId));
    } else {
      // Fallback: show all contracts (for debugging) - just in case something goes wrong
      q = query(contractsRef);
    }

    const querySnapshot = await getDocs(q);
    const contracts: any[] = [];
    
    querySnapshot.forEach((doc) => {
      contracts.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Sort by createdAt in memory instead of using orderBy - newer contracts first
    contracts.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0);
      const bTime = b.createdAt?.toDate?.() || new Date(0);
      return bTime.getTime() - aTime.getTime();
    });

    return contracts;
  } catch (error: any) {
    console.error('Failed to get contracts by user:', error);
    throw new Error(`Failed to get contracts: ${error.message}`);
  }
};

/**
 * Creates a new comment on a contract
 * Comments are used for communication between users about contracts
 * Includes user info and timestamp for tracking who said what when
 */
export const createComment = async (commentData: Partial<Comment>): Promise<string> => {
  try {
    const commentRef = collection(db, 'comments');
    const commentDoc: Comment = {
      contractId: commentData.contractId || '',
      userId: commentData.userId || '',
      userName: commentData.userName || '',
      userRole: commentData.userRole || '',
      message: commentData.message || '',
      isAdminComment: commentData.isAdminComment || false,
      createdAt: Timestamp.now()
    } as Comment;
    
    const docRef = await addDoc(commentRef, commentDoc);
    console.log('Comment created successfully:', docRef.id);
    return docRef.id;
  } catch (error: any) {
    console.error('Failed to create comment:', error);
    throw new Error(`Failed to create comment: ${error.message}`);
  }
};

/**
 * Gets all comments for a specific contract
 * Returns comments sorted by date (newest first)
 * Useful for showing the conversation history on a contract
 */
export const getContractComments = async (contractId: string): Promise<Comment[]> => {
  try {
    const commentsRef = collection(db, 'comments');
    const q = query(commentsRef, where('contractId', '==', contractId));
    const querySnapshot = await getDocs(q);
    
    const comments: Comment[] = [];
    querySnapshot.forEach((doc) => {
      comments.push({
        id: doc.id,
        ...doc.data()
      } as Comment);
    });

    // Sort by createdAt (newest first) - most recent comments at the top
    comments.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0);
      const bTime = b.createdAt?.toDate?.() || new Date(0);
      return bTime.getTime() - aTime.getTime();
    });

    return comments;
  } catch (error: any) {
    console.error('Failed to get contract comments:', error);
    throw new Error(`Failed to get comments: ${error.message}`);
  }
};

/**
 * Assigns a contract to a legal assistant for review
 * Updates the contract status to 'assigned' and records who it's assigned to
 * Also sets the assignment timestamp for tracking
 */
export const assignContract = async (contractId: string, assignedTo: string): Promise<void> => {
  try {
    const contractRef = doc(db, 'contracts', contractId);
    await updateDoc(contractRef, {
      assignedTo,
      assignedAt: Timestamp.now(),
      status: 'assigned'
    });
    console.log('Contract assigned successfully:', contractId, 'to:', assignedTo);
  } catch (error: any) {
    console.error('Failed to assign contract:', error);
    throw new Error(`Failed to assign contract: ${error.message}`);
  }
};

/**
 * Approves or rejects a contract with optional comment
 * This is the final step in the approval workflow
 * Records who made the decision and when
 */
export const approveRejectContract = async (
  contractId: string, 
  approvedBy: string, 
  isApproved: boolean, 
  comment?: string
): Promise<void> => {
  try {
    const contractRef = doc(db, 'contracts', contractId);
    const updateData: any = {
      approvedBy,
      status: isApproved ? 'approved' : 'rejected'
    };
    
    if (comment) {
      updateData.approvalComment = comment;
    }
    
    await updateDoc(contractRef, updateData);
    console.log('Contract approval status updated:', contractId, isApproved ? 'approved' : 'rejected');
  } catch (error: any) {
    console.error('Failed to update contract approval status:', error);
    throw new Error(`Failed to update approval status: ${error.message}`);
  }
};

/**
 * Gets all users with a specific role in an organization
 * Useful for finding legal assistants to assign contracts to
 * Returns users with their IDs included for easy reference
 */
export const getUsersByRole = async (organizationId: string, role: string): Promise<UserWithId[]> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(
      usersRef, 
      where('organizationId', '==', organizationId),
      where('role', '==', role)
    );
    const querySnapshot = await getDocs(q);
    
    const users: UserWithId[] = [];
    querySnapshot.forEach((doc) => {
      const userData = doc.data() as User;
      users.push({
        ...userData,
        id: doc.id
      });
    });

    return users;
  } catch (error: any) {
    console.error('Failed to get users by role:', error);
    throw new Error(`Failed to get users: ${error.message}`);
  }
};

// ===== ANALYSIS COUNTER FUNCTIONS =====

/**
 * Gets the current analysis count for an organization
 * This tracks how many contract analyses have been performed
 * Useful for billing, usage tracking, and analytics
 */
export const getAnalysisCount = async (organizationId: string): Promise<number> => {
  try {
    const counterRef = doc(db, 'analysisCounters', organizationId);
    const counterDoc = await getDoc(counterRef);
    
    if (counterDoc.exists()) {
      return counterDoc.data().count || 0;
    } else {
      // Initialize counter if it doesn't exist - first time setup
      await setDoc(counterRef, { count: 0, organizationId });
      return 0;
    }
  } catch (error: any) {
    console.error('Failed to get analysis count:', error);
    return 0; // Return 0 if there's an error - better than crashing
  }
};

/**
 * Increments the analysis counter for an organization
 * Called every time a contract analysis is performed
 * Helps track usage for billing and analytics purposes
 */
export const incrementAnalysisCount = async (organizationId: string): Promise<void> => {
  try {
    const counterRef = doc(db, 'analysisCounters', organizationId);
    const counterDoc = await getDoc(counterRef);
    
    if (counterDoc.exists()) {
      // Increment existing counter - add 1 to current count
      await updateDoc(counterRef, {
        count: (counterDoc.data().count || 0) + 1,
        lastUpdated: Timestamp.now()
      });
    } else {
      // Create new counter - first analysis for this organization
      await setDoc(counterRef, {
        count: 1,
        organizationId,
        createdAt: Timestamp.now(),
        lastUpdated: Timestamp.now()
      });
    }
  } catch (error: any) {
    console.error('Failed to increment analysis count:', error);
    throw new Error(`Failed to update analysis counter: ${error.message}`);
  }
};

/**
 * Processes existing contracts and updates their deadlines
 * This is a utility function for migrating old contracts
 * Adds deadline field to contracts that don't have it yet
 */
export const processExistingContractsForDeadlines = async (): Promise<void> => {
  try {
    const currentUser = await getCurrentUserWithData();
    if (!currentUser?.uid || !currentUser?.userData) {
      console.error('No current user or user data found');
      return;
    }

    // Get all contracts for the current user
    const contracts = await getContractsByUser(
      currentUser.uid,
      currentUser.userData.role,
      currentUser.userData.organizationId || undefined
    );

    for (const contract of contracts) {
      // Skip contracts that already have deadlines
      if (contract.deadline) {
        continue;
      }

      // Check if contract has analysis with deadline information
      if (contract.extractedClauses && contract.extractedClauses.length > 0) {
        const analysis = contract.extractedClauses[0]; // Get first analysis
        if (analysis && analysis.deadlines && analysis.deadlines !== 'No specific deadlines found') {
          // Import the deadline parsing function
          const { updateContractWithDeadline } = await import('./openaiServices');
          await updateContractWithDeadline(contract.id, analysis.deadlines);
        }
      }
    }
  } catch (error) {
    console.error('Error processing contracts for deadlines:', error);
  }
}; 
// App.tsx - This is the main entry point of the application

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getCurrentUserWithData, onAuthStateChange, type ExtendedUser } from './auth';
import { getRemainingSessionDays, isSessionValid } from './localStorage';
import { validateOpenAIKey } from './openaiServices';
import AdminAnalytics from './screens/AdminAnalytics';
import AdminCategoryManagement from './screens/AdminCategoryManagement';
import AdminContractDetailScreen from './screens/AdminContractDetailScreen';
import AdminContractOverview from './screens/AdminContractOverview';
import AdminHomeScreen from './screens/AdminHomeScreen';
import AdminUserManagement from './screens/AdminUserManagement';
import ContractDetailScreen from './screens/ContractDetailScreen';
import { default as OrgContractListScreen } from './screens/ContractListScreen';
import ContractUploadScreen from './screens/ContractUploadScreen';
import { default as OrgHomeScreen } from './screens/HomeScreen';
import LegalAssistantContractDetailScreen from './screens/LegalAssistantContractDetailScreen';
import LegalAssistantContractListScreen from './screens/LegalAssistantContractListScreen';
import LegalAssistantHomeScreen from './screens/LegalAssistantHomeScreen';
import LoginScreen from './screens/LoginScreen';
import OrgContractDetailScreen from './screens/OrgContractDetailScreen';
import OrgContractUploadScreen from './screens/OrgContractUploadScreen';
import PendingApprovalScreen from './screens/PendingApprovalScreen';
import StandaloneContractDetailScreen from './screens/StandaloneContractDetailScreen';
import StandaloneContractListScreen from './screens/StandaloneContractListScreen';
import StandaloneHomeScreen from './screens/StandaloneHomeScreen';

// Navigation parameter types - these define what data we pass between screens
export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OrgHome: undefined;
  ContractUpload: undefined;
  OrgContractUpload: undefined;
  ContractList: undefined;
  OrgContractList: undefined;
  ContractDetail: { contractId: string };
  OrgContractDetail: { contractId: string };
  StandaloneContractDetail: { contractId: string };
  LegalAssistantHome: undefined;
  LegalAssistantContractList: undefined;
  LegalAssistantContractDetail: { contractId: string };
  AdminHome: undefined;
  AdminUserManagement: undefined;
  AdminCategoryManagement: undefined;
  AdminContractOverview: undefined;
  AdminAnalytics: undefined;
  PendingApproval: undefined;
  AdminContractDetail: { contractId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Role-based navigation component that shows different screens based on user role
 * This is the main navigation logic that routes users to the right screens
 * Different user types (admin, legal assistant, org user, etc.) see different screens
 */
function RoleBasedNavigation({ user }: { user: ExtendedUser }) {
  const userRole = user.userData?.role;
  const userStatus = user.userData?.status;

  console.log('RoleBasedNavigation: User role:', userRole);
  console.log('RoleBasedNavigation: User status:', userStatus);
  console.log('RoleBasedNavigation: User data:', user.userData);

  // Check if user is pending approval - show waiting screen if they haven't been approved yet
  if (userStatus === 'pending') {
    console.log('RoleBasedNavigation: User is pending, routing to PendingApproval');
    return (
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName="PendingApproval"
      >
        <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
      </Stack.Navigator>
    );
  }

  console.log('RoleBasedNavigation: User is approved, proceeding with role-based routing');

  /**
   * Determines which screen to show first based on user role
   * Each role has their own home screen with different functionality
   */
  const getInitialScreen = () => {
    // Then check user role for approved users
    switch (userRole) {
      case 'admin':
      case 'creator':
        console.log('RoleBasedNavigation: Routing to AdminHome');
        return 'AdminHome';
      case 'org_user':
        console.log('RoleBasedNavigation: Routing to OrgHome');
        return 'OrgHome';
      case 'legal_assistant':
        console.log('RoleBasedNavigation: Routing to LegalAssistantHome');
        return 'LegalAssistantHome';
      case 'standalone':
      case 'viewer':
      default:
        console.log('RoleBasedNavigation: Routing to Home');
        return 'Home';
    }
  };

  const initialScreen = getInitialScreen();
  console.log('RoleBasedNavigation: Initial screen:', initialScreen);

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={initialScreen}
    >
      {/* Standalone user screens - for individual users */}
      <Stack.Screen name="Home" component={StandaloneHomeScreen} />
      <Stack.Screen name="ContractUpload" component={ContractUploadScreen} />
      <Stack.Screen name="ContractList" component={StandaloneContractListScreen} />
      <Stack.Screen name="ContractDetail" component={ContractDetailScreen} />
      <Stack.Screen name="StandaloneContractDetail" component={StandaloneContractDetailScreen} />
      
      {/* Organization user screens - for company users */}
      <Stack.Screen name="OrgHome" component={OrgHomeScreen} />
      <Stack.Screen name="OrgContractUpload" component={OrgContractUploadScreen} />
      <Stack.Screen name="OrgContractList" component={OrgContractListScreen} />
      <Stack.Screen name="OrgContractDetail" component={OrgContractDetailScreen} />
      
      {/* Legal Assistant screens - for contract reviewers */}
      <Stack.Screen name="LegalAssistantHome" component={LegalAssistantHomeScreen} />
      <Stack.Screen name="LegalAssistantContractList" component={LegalAssistantContractListScreen} />
      <Stack.Screen name="LegalAssistantContractDetail" component={LegalAssistantContractDetailScreen} />
      
      {/* Admin screens - for system administrators */}
      <Stack.Screen name="AdminHome" component={AdminHomeScreen} />
      <Stack.Screen name="AdminUserManagement" component={AdminUserManagement} />
      <Stack.Screen name="AdminCategoryManagement" component={AdminCategoryManagement} />
      <Stack.Screen name="AdminContractOverview" component={AdminContractOverview} />
      <Stack.Screen name="AdminAnalytics" component={AdminAnalytics} />
      <Stack.Screen name="AdminContractDetail" component={AdminContractDetailScreen} />
      
      {/* Pending approval screen - for users awaiting approval */}
      <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
    </Stack.Navigator>
  );
}

/**
 * Main App component that handles authentication state and navigation
 * This is the root component that manages the entire app lifecycle
 * Shows loading screen while checking auth, then routes to appropriate navigation
 */
export default function App() {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    /**
     * Checks if the user has a valid session on app startup
     * This helps users stay logged in between app launches
     */
    const checkSession = async () => {
      try {
        const sessionValid = await isSessionValid();
        if (sessionValid) {
          const remainingDays = await getRemainingSessionDays();
          console.log(`App: Valid session found, ${remainingDays} days remaining`);
        } else {
          console.log('App: No valid session found');
        }
      } catch (error) {
        console.error('App: Error checking session:', error);
      }
    };

    /**
     * Validates the OpenAI API key on app startup
     * This helps catch authentication issues early
     */
    const validateAPI = async () => {
      try {
        await validateOpenAIKey();
      } catch (error) {
        console.error('App: OpenAI API key validation failed:', error);
      }
    };

    checkSession();
    validateAPI();

    // Listen to Firebase Auth state changes using our auth function
    // This detects when users login/logout and updates the UI accordingly
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      try {
        console.log('App: Auth state changed, user:', firebaseUser ? firebaseUser.email : 'null');
        if (firebaseUser) {
          const userWithData = await getCurrentUserWithData();
          setUser(userWithData);
        } else {
          setUser(null);
        }
      } catch (e) {
        console.warn('App: Auth check error:', e);
        setUser(null);
      } finally {
        setChecking(false);
      }
    });

    // Cleanup subscription - important to prevent memory leaks
    return () => unsubscribe();
  }, []);

  // Show loading spinner while checking authentication status
  if (checking) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? (
        // User is logged in - show role-based navigation
        <RoleBasedNavigation user={user} />
      ) : (
        // User is not logged in - show login screen
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

// Styles for the loading screen
const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

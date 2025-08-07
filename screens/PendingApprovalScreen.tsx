import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { getCurrentUserWithData, logout } from '../auth';

export default function PendingApprovalScreen() {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkUserStatus();
    
    // Set up periodic status check every 30 seconds
    const interval = setInterval(() => {
      checkUserStatus();
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const checkUserStatus = async () => {
    try {
      setCheckingStatus(true);
      const currentUser = await getCurrentUserWithData();
      
      if (currentUser?.userData) {
        setUserData(currentUser.userData);
        
        // If user is approved, trigger a navigation update
        if (currentUser.userData.status === 'approved') {
          console.log('PendingApprovalScreen: User approved, triggering navigation update');
          // Force a re-render by updating state
          setCheckingStatus(false);
          // The App.tsx routing logic will handle the navigation
        }
      }
    } catch (error) {
      console.error('Error checking user status:', error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await checkUserStatus();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Show loading while checking status
  if (checkingStatus) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Checking account status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // If user is approved, show a brief message before navigation
  if (userData?.status === 'approved') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Account approved! Redirecting...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#007bff']}
            tintColor="#007bff"
          />
        }
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>⏳</Text>
          </View>
          
          <Text style={styles.title}>Account Pending</Text>
          <Text style={styles.subtitle}>
            Your registration is currently under review by the administrator.
          </Text>
          
          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>Next Steps</Text>
            <View style={styles.stepContainer}>
              <View style={styles.stepItem}>
                <View style={styles.stepNumberContainer}>
                  <Text style={styles.stepNumber}>1</Text>
                </View>
                <Text style={styles.stepText}>Administrator reviews your registration</Text>
              </View>
              <View style={styles.stepItem}>
                <View style={styles.stepNumberContainer}>
                  <Text style={styles.stepNumber}>2</Text>
                </View>
                <Text style={styles.stepText}>Role assignment within organization</Text>
              </View>
              <View style={styles.stepItem}>
                <View style={styles.stepNumberContainer}>
                  <Text style={styles.stepNumber}>3</Text>
                </View>
                <Text style={styles.stepText}>Access granted to application</Text>
              </View>
              <View style={styles.stepItem}>
                <View style={styles.stepNumberContainer}>
                  <Text style={styles.stepNumber}>4</Text>
                </View>
                <Text style={styles.stepText}>Login available once approved</Text>
              </View>
            </View>
          </View>
          
          <View style={styles.contactContainer}>
            <Text style={styles.contactTitle}>Need Assistance?</Text>
            <Text style={styles.contactText}>
              Contact your organization administrator for support.
            </Text>
          </View>
        </View>
      </ScrollView>
      
      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 12,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 30,
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    marginBottom: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  infoContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 16,
    textAlign: 'center',
  },
  stepContainer: {
    gap: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumberContainer: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  stepNumber: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  stepText: {
    fontSize: 12,
    color: '#495057',
    flex: 1,
    lineHeight: 16,
  },
  contactContainer: {
    backgroundColor: '#e7f3ff',
    borderRadius: 10,
    padding: 16,
    width: '100%',
    borderLeftWidth: 3,
    borderLeftColor: '#007bff',
  },
  contactTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 6,
  },
  contactText: {
    fontSize: 11,
    color: '#6c757d',
    lineHeight: 15,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
  },
  logoutButton: {
    backgroundColor: '#6c757d',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
}); 
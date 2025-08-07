// screens/HomeScreen.tsx - This is the main dashboard screen for organization users

import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentUserWithData, logout } from '../auth';
import { getContractsByUser, getDocumentsWithFilter, type Contract, type Notification } from '../firebaseServices';

interface OrgHomeScreenProps {
  navigation: any;
}

/**
 * Main dashboard screen for organization users
 * Shows recent contracts, notifications, and quick actions
 * This is the first screen users see after logging in
 */
export default function OrgHomeScreen({ navigation }: OrgHomeScreenProps) {
  // State variables for managing dashboard data
  const [recentContracts, setRecentContracts] = useState<Contract[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);

  // Load dashboard data when component mounts
  useEffect(() => {
    loadDashboardData();
  }, []);

  /**
   * Loads all the dashboard data including contracts and notifications
   * This is the main function that populates the dashboard
   */
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const currentUser = await getCurrentUserWithData();
      if (currentUser?.userData) {
        setUserData(currentUser.userData);
        await Promise.all([
          loadRecentContracts(currentUser.userData),
          loadNotifications(currentUser.userData)
        ]);
      }
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Loads the most recent contracts for the current user
   * Shows the latest 2 contracts on the dashboard
   */
  const loadRecentContracts = async (userData: any) => {
    try {
      const contracts = await getContractsByUser(
        userData.organizationId || userData.id, 
        userData.role, 
        userData.organizationId
      );
      // Sort by upload date (newest first) and take first 2 - show most recent contracts
      const sortedContracts = contracts
        .sort((a: any, b: any) => b.createdAt.toDate() - a.createdAt.toDate())
        .slice(0, 2);
      setRecentContracts(sortedContracts);
    } catch (error: any) {
      console.error('Error loading contracts:', error);
    }
  };

  /**
   * Loads notifications for the current user
   * Shows the latest 3 notifications on the dashboard
   */
  const loadNotifications = async (userData: any) => {
    try {
      // Get real notifications from Firebase - these are system notifications
      const notificationsData = await getDocumentsWithFilter(
        'notifications',
        'userId',
        '==',
        userData.organizationId || userData.id
      );
      
      // Sort by timestamp (newest first) and take first 3 - show most recent notifications
      const sortedNotifications = notificationsData
        .sort((a: any, b: any) => b.createdAt.toDate() - a.createdAt.toDate())
        .slice(0, 3)
        .map((doc: any) => ({
          id: doc.id,
          userId: doc.userId,
          message: doc.message,
          type: doc.type,
          read: doc.read,
          createdAt: doc.createdAt,
          contractId: doc.contractId
        } as Notification));
      setNotifications(sortedNotifications);
    } catch (error: any) {
      console.error('Error loading notifications:', error);
    }
  };

  /**
   * Maps internal contract status to user-friendly status for org users
   * Simplifies the status display for better user experience
   */
  const getOrgUserStatus = (status: string) => {
    switch (status) {
      case 'uploaded':
      case 'analyzed':
      case 'reviewed':
        return 'uploaded';
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      default:
        return 'uploaded';
    }
  };

  /**
   * Gets the color for status badges based on contract status
   * Green for approved, red for rejected, blue for others
   */
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return '#28a745';
      case 'rejected':
        return '#dc3545';
      default:
        return '#007bff';
    }
  };

  /**
   * Gets the display text for contract status
   * Shows user-friendly status with icons
   */
  const getStatusText = (status: string) => {
    const orgStatus = getOrgUserStatus(status);
    switch (orgStatus) {
      case 'approved':
        return '✓ Approved';
      case 'rejected':
        return '❌ Rejected';
      default:
        return '📄 Uploaded';
    }
  };

  /**
   * Handles when user taps on a contract card
   * Navigates to the contract detail screen
   */
  const handleContractPress = (contract: any) => {
    navigation.navigate('OrgContractDetail', { contractId: contract.id || '' });
  };

  /**
   * Handles when user taps "View All Contracts"
   * Navigates to the full contract list screen
   */
  const handleViewAllContracts = () => {
    navigation.navigate('OrgContractList');
  };

  /**
   * Handles when user taps "View All Notifications"
   * Currently shows a placeholder message
   */
  const handleViewAllNotifications = () => {
    // TODO: Implement notifications screen
  };

  /**
   * Handles when user taps "Upload Contract"
   * Navigates to the contract upload screen
   */
  const handleUploadContract = () => {
    navigation.navigate('OrgContractUpload');
  };

  /**
   * Handles user logout
   * Clears session and shows success message
   */
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error: any) {
      console.error('Logout error:', error);
    }
  };

  /**
   * Renders a contract card for the dashboard
   * Shows contract title, status, category, and date
   */
  const renderContractCard = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.contractCard}
      onPress={() => handleContractPress(item)}
    >
      <View style={styles.contractHeader}>
        <Text style={styles.contractTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(getOrgUserStatus(item.status)) }]}>
          <Text style={styles.statusBadgeText}>
            {getStatusText(item.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.contractCategory}>{item.category || 'General'}</Text>
      <Text style={styles.contractDate}>
        {item.createdAt.toDate().toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  const renderNotificationCard = ({ item }: { item: Notification }) => (
    <View style={styles.notificationCard}>
      <View style={styles.notificationIcon}>
        <Text style={styles.notificationIconText}>
          {item.type === 'status-update' ? '📢' :
           item.type === 'assignment' ? '📋' :
           item.type === 'approval' ? '✅' : '📢'}
        </Text>
      </View>
      <View style={styles.notificationContent}>
        <Text style={styles.notificationTitle} numberOfLines={2}>
          {item.message}
        </Text>
        <Text style={styles.notificationDate}>
          {item.createdAt.toDate().toLocaleDateString()}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard</Text>
        {userData && (
          <Text style={styles.userName}>Welcome, {userData.fullName}</Text>
        )}
      </View>

      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Contracts Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Contracts</Text>
            <TouchableOpacity onPress={handleViewAllContracts}>
              <Text style={styles.viewAllLink}>View All</Text>
            </TouchableOpacity>
          </View>
          
          {recentContracts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No contracts yet</Text>
            </View>
          ) : (
            <FlatList
              data={recentContracts}
              renderItem={renderContractCard}
              keyExtractor={(item, index) => index.toString()}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <TouchableOpacity onPress={handleViewAllNotifications}>
              <Text style={styles.viewAllLink}>View All</Text>
            </TouchableOpacity>
          </View>
          
          {notifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No notifications</Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              renderItem={renderNotificationCard}
              keyExtractor={(item, index) => index.toString()}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        {/* Logout Button */}
        <View style={styles.logoutContainer}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity style={styles.fab} onPress={handleUploadContract}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
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
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#666',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 3,
  },
  userName: {
    fontSize: 13,
    color: '#6c757d',
  },
  scrollContainer: {
    flex: 1,
  },
  section: {
    margin: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: '#f8f9fa',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  viewAllLink: {
    fontSize: 11,
    color: '#007bff',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 15,
  },
  emptyText: {
    fontSize: 13,
    color: '#6c757d',
  },
  contractCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007bff',
  },
  contractHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  contractTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    minWidth: 75,
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  contractCategory: {
    fontSize: 11,
    color: '#6c757d',
    marginBottom: 4,
  },
  contractDate: {
    fontSize: 9,
    color: '#adb5bd',
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  notificationIcon: {
    marginRight: 12,
  },
  notificationIconText: {
    fontSize: 16,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 3,
  },
  notificationDate: {
    fontSize: 9,
    color: '#adb5bd',
  },
  logoutContainer: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  logoutButton: {
    backgroundColor: '#dc3545',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
});

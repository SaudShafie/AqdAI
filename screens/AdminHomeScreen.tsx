import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { RootStackParamList } from '../App';
import { getCurrentUserWithData, logout, onAuthStateChange, type ExtendedUser } from '../auth';
import { db } from '../firebase';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminHome'>;

interface AdminStats {
  totalUsers: number;
  pendingUsers: number;
  totalContracts: number;
  activeContracts: number;
}

export default function AdminHomeScreen({ navigation }: Props) {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    pendingUsers: 0,
    totalContracts: 0,
    activeContracts: 0
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      if (user) {
        try {
          const userWithData = await getCurrentUserWithData();
          if (userWithData) {
            console.log('AdminHomeScreen: User data loaded:', userWithData);
            console.log('AdminHomeScreen: User role:', userWithData.userData?.role);
            console.log('AdminHomeScreen: Organization ID:', userWithData.userData?.organizationId);
            setUser(userWithData);
            loadAdminData();
          }
        } catch (error) {
          console.error('Failed to get user data:', error);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Reload data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (user?.uid) {
        loadAdminData();
      }
    }, [user?.uid])
  );

  const loadAdminData = async () => {
    if (!user?.uid || !user.userData?.organizationId) return;

    try {
      setRefreshing(true);
      
      // Load organization stats
      await loadOrganizationStats();
      
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const loadOrganizationStats = async () => {
    if (!user?.userData?.organizationId) return;

    try {
      // Get all users in the organization
      const usersRef = collection(db, 'users');
      const usersQuery = query(
        usersRef,
        where('organizationId', '==', user.userData.organizationId)
      );
      const usersSnapshot = await getDocs(usersQuery);
      
      const totalUsers = usersSnapshot.size;
      const pendingUsers = usersSnapshot.docs.filter(doc => doc.data().status === 'pending').length;

      // Get all contracts in the organization
      const contractsRef = collection(db, 'contracts');
      const contractsQuery = query(
        contractsRef,
        where('organizationId', '==', user.userData.organizationId)
      );
      const contractsSnapshot = await getDocs(contractsQuery);
      
      const totalContracts = contractsSnapshot.size;
      const activeContracts = contractsSnapshot.docs.filter(doc => 
        doc.data().status === 'analyzed' || doc.data().status === 'uploaded' || doc.data().status === 'assigned'
      ).length;

      setStats({
        totalUsers,
        pendingUsers,
        totalContracts,
        activeContracts
      });

    } catch (error) {
      console.error('Error loading organization stats:', error);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (error) {
              console.error('Logout error:', error);
            }
          },
        },
      ]
    );
  };

  const handleRefresh = () => {
    loadAdminData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Please log in</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Admin Dashboard</Text>
        
        <Text style={styles.welcomeText}>
          Welcome back, {user.userData?.fullName || user.email}
        </Text>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#007aff']}
            tintColor="#007aff"
          />
        }
      >
        {/* Quick Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organization Overview</Text>
                     <View style={styles.statsGrid}>
             <View style={styles.statCard}>
               <Text style={styles.statNumber}>{stats.totalUsers}</Text>
               <Text style={styles.statLabel}>Total Users</Text>
             </View>
             <View style={styles.statCard}>
               <Text style={styles.statNumber}>{stats.pendingUsers}</Text>
               <Text style={styles.statLabel}>Pending Approval</Text>
             </View>
             <View style={styles.statCard}>
               <Text style={styles.statNumber}>{stats.totalContracts}</Text>
               <Text style={styles.statLabel}>Total Contracts</Text>
             </View>
             <View style={styles.statCard}>
               <Text style={styles.statNumber}>{stats.activeContracts}</Text>
               <Text style={styles.statLabel}>Active Contracts</Text>
             </View>
           </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
                     <View style={styles.actionsGrid}>
             <TouchableOpacity 
               style={styles.actionCard}
               onPress={() => navigation.navigate('AdminUserManagement')}
             >
               <Text style={styles.actionIcon}>👥</Text>
               <Text style={styles.actionTitle}>Manage Users</Text>
               <Text style={styles.actionSubtitle}>
                 {stats.pendingUsers > 0 ? `${stats.pendingUsers} pending approval` : 'All users approved'}
               </Text>
             </TouchableOpacity>

             <TouchableOpacity 
               style={styles.actionCard}
               onPress={() => navigation.navigate('AdminCategoryManagement')}
             >
               <Text style={styles.actionIcon}>📂</Text>
               <Text style={styles.actionTitle}>Categories</Text>
               <Text style={styles.actionSubtitle}>Manage contract categories</Text>
             </TouchableOpacity>

             <TouchableOpacity 
               style={styles.actionCard}
               onPress={() => navigation.navigate('AdminContractOverview')}
             >
               <Text style={styles.actionIcon}>📋</Text>
               <Text style={styles.actionTitle}>All Contracts</Text>
               <Text style={styles.actionSubtitle}>View & manage contracts</Text>
             </TouchableOpacity>

             <TouchableOpacity 
               style={styles.actionCard}
               onPress={() => navigation.navigate('AdminAnalytics')}
             >
               <Text style={styles.actionIcon}>📊</Text>
               <Text style={styles.actionTitle}>Analytics</Text>
               <Text style={styles.actionSubtitle}>Organization insights</Text>
             </TouchableOpacity>
           </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
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
  header: {
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 15,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f8f9fa',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#6c757d',
    textAlign: 'center',
    fontWeight: '500',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 3,
    textAlign: 'center',
  },
  actionSubtitle: {
    fontSize: 10,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 12,
  },
  logoutButton: {
    backgroundColor: '#dc3545',
    margin: 35,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
}); 
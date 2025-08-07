// screens/StandaloneHomeScreen.tsx
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentUserWithData, logout } from '../auth';
import { getContractsByUser, getDocumentsWithFilter, type Contract, type Notification } from '../firebaseServices';
import { calculateDaysRemaining, formatDeadlineMessage } from '../openaiServices';

interface StandaloneHomeScreenProps {
  navigation: any;
}

export default function StandaloneHomeScreen({ navigation }: StandaloneHomeScreenProps) {
  const [recentContracts, setRecentContracts] = useState<Contract[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
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
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const loadRecentContracts = async (userData: any) => {
    try {
      const currentUser = await getCurrentUserWithData();
      if (!currentUser?.uid) {
        console.error('No current user found');
        return;
      }
      
      const contracts = await getContractsByUser(
        currentUser.uid, 
        userData.role, 
        userData.organizationId
      );
      
      // Sort by upload date (newest first) and take first 2
      const sortedContracts = contracts
        .sort((a: any, b: any) => b.createdAt.toDate() - a.createdAt.toDate())
        .slice(0, 2);
      setRecentContracts(sortedContracts);
    } catch (error: any) {
      console.error('Error loading contracts:', error);
    }
  };

  const loadNotifications = async (userData: any) => {
    try {
      const currentUser = await getCurrentUserWithData();
      if (!currentUser?.uid) {
        console.error('No current user found');
        return;
      }

      // Get real notifications from Firebase
      const notificationsData = await getDocumentsWithFilter(
        'notifications',
        'userId',
        '==',
        currentUser.uid
      );

      // Generate basic dynamic notifications
      const dynamicNotifications = await generateBasicNotifications();
      
      // Combine real and dynamic notifications
      const allNotifications = [...notificationsData, ...dynamicNotifications];
      
      // Sort by timestamp (newest first)
      const sortedNotifications = allNotifications
        .filter((doc: any) => doc && doc.createdAt)
        .sort((a: any, b: any) => {
          const aDate = a.createdAt?.toDate?.() || new Date(a.createdAt);
          const bDate = b.createdAt?.toDate?.() || new Date(b.createdAt);
          return bDate.getTime() - aDate.getTime();
        })
        .slice(0, 5)
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

  const generateBasicNotifications = async () => {
    const dynamicNotifications: any[] = [];
    const currentDate = new Date();
    
    const currentUser = await getCurrentUserWithData();
    if (!currentUser?.uid) {
      return dynamicNotifications;
    }
    
    const allContracts = await getContractsByUser(
      currentUser.uid, 
      userData?.role, 
      userData?.organizationId
    );
    
    // Check contracts for basic status notifications
    for (const contract of allContracts) {
      if (!contract) continue;
      
      const contractDate = contract.createdAt?.toDate?.() || new Date();
      const daysSinceUpload = Math.floor((currentDate.getTime() - contractDate.getTime()) / (1000 * 60 * 60 * 24));
      const contractId = (contract as any).id || `contract_${Math.random()}`;
      
      // Basic status notifications (only for recent contracts)
      if (daysSinceUpload <= 1) {
        if (contract.status === 'analyzed') {
          dynamicNotifications.push({
            id: `analysis_${contractId}`,
            userId: contract.uploadedBy,
            message: `Contract "${contract.title}" has been analyzed successfully.`,
            type: 'status-update',
            read: false,
            createdAt: contractDate,
            contractId: contractId
          });
        } else if (contract.status === 'approved') {
          dynamicNotifications.push({
            id: `approval_${contractId}`,
            userId: contract.uploadedBy,
            message: `Contract "${contract.title}" has been approved.`,
            type: 'approval',
            read: false,
            createdAt: contractDate,
            contractId: contractId
          });
        } else if (contract.status === 'rejected') {
          dynamicNotifications.push({
            id: `rejection_${contractId}`,
            userId: contract.uploadedBy,
            message: `Contract "${contract.title}" has been rejected. Please review and resubmit if needed.`,
            type: 'status-update',
            read: false,
            createdAt: contractDate,
            contractId: contractId
          });
        } else if (contract.status === 'uploaded') {
          dynamicNotifications.push({
            id: `upload_${contractId}`,
            userId: contract.uploadedBy,
            message: `Contract "${contract.title}" uploaded successfully. Analysis in progress...`,
            type: 'status-update',
            read: false,
            createdAt: contractDate,
            contractId: contractId
          });
        }
      }
      
      // Simple deadline warnings (if contract has deadline)
      const deadline = contract.deadline;
      if (deadline) {
        try {
          const deadlineDate = deadline.toDate();
          const daysRemaining = calculateDaysRemaining(deadlineDate);
          
          if (daysRemaining <= 30) {
            const deadlineMessage = formatDeadlineMessage(contract.title, daysRemaining);
            dynamicNotifications.push({
              id: `deadline_${contractId}`,
              userId: contract.uploadedBy,
              message: deadlineMessage,
              type: 'status-update',
              read: false,
              createdAt: contractDate,
              contractId: contractId
            });
          }
        } catch (error) {
          console.error(`Error processing deadline for contract ${contract.title}:`, error);
        }
      }
    }
    
    return dynamicNotifications;
  };

  const dismissNotification = async (notificationId: string) => {
    try {
      // Remove from local state
      setNotifications(prevNotifications => 
        prevNotifications.filter(notification => {
          const notificationKey = `${notification.message}_${notification.createdAt?.toDate?.()?.getTime()}`;
          return notificationKey !== notificationId;
        })
      );
    } catch (error) {
      console.error('Error dismissing notification:', error);
    }
  };

  const dismissAllNotifications = async () => {
    try {
      setNotifications([]);
    } catch (error) {
      console.error('Error dismissing all notifications:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return '#28a745';
      case 'rejected':
        return '#dc3545';
      case 'analyzed':
        return '#17a2b8';
      default:
        return '#007bff';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return '✓ Approved';
      case 'rejected':
        return '❌ Rejected';
      case 'analyzed':
        return '📊 Analyzed';
      case 'uploaded':
        return '📄 Uploaded';
      default:
        return '📄 Uploaded';
    }
  };

  const handleContractPress = (contract: any) => {
    navigation.navigate('StandaloneContractDetail', { contractId: contract.id || '' });
  };

  const handleViewAllContracts = () => {
    navigation.navigate('ContractList');
  };

  const handleUploadContract = () => {
    navigation.navigate('ContractUpload');
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error: any) {
      console.error('Logout error:', error);
    }
  };

  const renderContractCard = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.contractCard}
      onPress={() => handleContractPress(item)}
    >
      <View style={styles.contractHeader}>
        <Text style={styles.contractTitle} numberOfLines={1}>
          {item.title || 'Untitled Contract'}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusBadgeText}>{getStatusText(item.status)}</Text>
        </View>
      </View>
      {item.category && (
        <Text style={styles.contractCategory}>Category: {item.category}</Text>
      )}
      <Text style={styles.contractDate}>
        {item.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown date'}
      </Text>
    </TouchableOpacity>
  );

  const renderNotificationCard = ({ item }: { item: Notification }) => {
    const getNotificationIcon = () => {
      if (item.message.includes('🚨')) return '🚨';
      if (item.message.includes('⚠️')) return '⚠️';
      if (item.message.includes('approved')) return '✅';
      if (item.message.includes('rejected')) return '❌';
      if (item.message.includes('analyzed')) return '📊';
      if (item.message.includes('uploaded')) return '📄';
      return '📢';
    };

    const getNotificationColor = () => {
      if (item.message.includes('🚨')) return '#dc3545';
      if (item.message.includes('⚠️')) return '#ffc107';
      if (item.message.includes('approved')) return '#28a745';
      if (item.message.includes('rejected')) return '#dc3545';
      if (item.message.includes('analyzed')) return '#17a2b8';
      return '#007bff';
    };

    const notificationKey = `${item.message}_${item.createdAt?.toDate?.()?.getTime()}`;

    return (
      <View style={[styles.notificationCard, { borderLeftColor: getNotificationColor(), borderLeftWidth: 3 }]}>
        <View style={styles.notificationIcon}>
          <Text style={styles.notificationIconText}>{getNotificationIcon()}</Text>
        </View>
        <View style={styles.notificationContent}>
          <Text style={styles.notificationTitle} numberOfLines={2}>
            {item.message}
          </Text>
          <Text style={styles.notificationDate}>
            {item.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown date'}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.dismissButton}
          onPress={() => dismissNotification(notificationKey)}
        >
          <Text style={styles.dismissButtonText}>×</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
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

       <FlatList 
         style={styles.scrollContainer} 
         showsVerticalScrollIndicator={false}
         refreshControl={
           <RefreshControl
             refreshing={refreshing}
             onRefresh={() => loadDashboardData(true)}
             colors={['#007bff']}
             tintColor="#007bff"
           />
         }
         data={[
           { type: 'contracts', data: recentContracts },
           { type: 'notifications', data: notifications }
         ]}
         renderItem={({ item }) => {
           if (item.type === 'contracts') {
             return (
               <View style={styles.section}>
                 <View style={styles.sectionHeader}>
                   <Text style={styles.sectionTitle}>Contracts</Text>
                   <TouchableOpacity onPress={handleViewAllContracts}>
                     <Text style={styles.viewAllLink}>View All</Text>
                   </TouchableOpacity>
                 </View>
                 
                 {item.data.length === 0 ? (
                   <View style={styles.emptyContainer}>
                     <Text style={styles.emptyText}>No contracts yet</Text>
                   </View>
                 ) : (
                   <View>
                     {item.data.map((contract: any, index: number) => (
                       <View key={index}>
                         {renderContractCard({ item: contract })}
                       </View>
                     ))}
                   </View>
                 )}
               </View>
             );
           } else {
             return (
               <View style={styles.section}>
                 <View style={styles.sectionHeader}>
                   <View style={styles.sectionTitleContainer}>
                     <Text style={styles.sectionTitle}>Notifications</Text>
                     {item.data.length > 0 && (
                       <View style={styles.notificationBadge}>
                         <Text style={styles.notificationBadgeText}>{item.data.length}</Text>
                       </View>
                     )}
                   </View>
                   <View style={styles.notificationActions}>
                     {item.data.length > 0 && (
                       <TouchableOpacity onPress={dismissAllNotifications} style={styles.dismissAllButton}>
                         <Text style={styles.dismissAllText}>Dismiss All</Text>
                       </TouchableOpacity>
                     )}
                   </View>
                 </View>
                 
                 {item.data.length === 0 ? (
                   <View style={styles.emptyContainer}>
                     <Text style={styles.emptyText}>No notifications</Text>
                     <Text style={styles.emptySubtext}>You'll see notifications here for contract updates and deadlines</Text>
                   </View>
                 ) : (
                   <View>
                     {item.data.map((notification: any, index: number) => (
                       <View key={index}>
                         {renderNotificationCard({ item: notification as Notification })}
                       </View>
                     ))}
                   </View>
                 )}
               </View>
             );
           }
         }}
         keyExtractor={(item, index) => `${item.type}_${index}`}
         ListFooterComponent={() => (
           <View style={styles.logoutContainer}>
             <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
               <Text style={styles.logoutButtonText}>Logout</Text>
             </TouchableOpacity>
           </View>
         )}
       />

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
  emptySubtext: {
    fontSize: 11,
    color: '#adb5bd',
    textAlign: 'center',
    marginTop: 4,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationBadge: {
    backgroundColor: '#dc3545',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  notificationBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
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
  dismissButton: {
    padding: 5,
    marginLeft: 10,
  },
  dismissButtonText: {
    fontSize: 16,
    color: '#6c757d',
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
    bottom: 25,
    right: 25,
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
     fabText: {
     fontSize: 28,
     color: '#fff',
     fontWeight: 'bold',
   },
   notificationActions: {
     flexDirection: 'row',
     alignItems: 'center',
   },
   dismissAllButton: {
     marginRight: 10,
   },
   dismissAllText: {
     fontSize: 11,
     color: '#007bff',
     fontWeight: '600',
   },
   notificationList: {
     flex: 1,
   },
   notificationListContent: {
     paddingBottom: 15,
   },
}); 
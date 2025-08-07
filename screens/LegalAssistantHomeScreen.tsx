// screens/LegalAssistantHomeScreen.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentUserWithData, logout } from '../auth';
import { db } from '../firebase';
import { getContractsByUser, getDocumentsWithFilter, type Contract, type Notification } from '../firebaseServices';
import { calculateDaysRemaining, formatDeadlineMessage } from '../openaiServices';
import { isNetworkConnected } from '../utils/networkUtils';

interface LegalAssistantHomeScreenProps {
  navigation: any;
}

interface SectionData {
  type: 'contracts' | 'notifications';
  data: any[];
}

export default function LegalAssistantHomeScreen({ navigation }: LegalAssistantHomeScreenProps) {
  const [assignedContracts, setAssignedContracts] = useState<Contract[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDismissedNotifications = async () => {
    try {
      const dismissed = await AsyncStorage.getItem('dismissedNotifications');
      if (dismissed) {
        setDismissedNotifications(new Set(JSON.parse(dismissed)));
      }
    } catch (error) {
      console.error('Error loading dismissed notifications:', error);
    }
  };

  const saveDismissedNotifications = async (dismissed: Set<string>) => {
    try {
      await AsyncStorage.setItem('dismissedNotifications', JSON.stringify([...dismissed]));
    } catch (error) {
      console.error('Error saving dismissed notifications:', error);
    }
  };

  const cleanupDismissedNotifications = async () => {
    try {
      // Keep only the last 100 dismissed notifications to prevent storage bloat
      const dismissed = await AsyncStorage.getItem('dismissedNotifications');
      if (dismissed) {
        const dismissedArray = JSON.parse(dismissed);
        if (dismissedArray.length > 100) {
          const trimmedArray = dismissedArray.slice(-100); // Keep only last 100
          await AsyncStorage.setItem('dismissedNotifications', JSON.stringify(trimmedArray));
          setDismissedNotifications(new Set(trimmedArray));
        }
      }
    } catch (error) {
      console.error('Error cleaning up dismissed notifications:', error);
    }
  };

  const clearDismissedNotificationsFromStorage = async (notificationIds: string[]) => {
    try {
      const dismissed = await AsyncStorage.getItem('dismissedNotifications');
      if (dismissed) {
        const dismissedArray = JSON.parse(dismissed);
        const updatedDismissed = dismissedArray.filter((id: string) => !notificationIds.includes(id));
        await AsyncStorage.setItem('dismissedNotifications', JSON.stringify(updatedDismissed));
        setDismissedNotifications(new Set(updatedDismissed));
      }
    } catch (error) {
      console.error('Error clearing dismissed notifications from storage:', error);
    }
  };

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
        
        // Load dismissed notifications first
        await loadDismissedNotifications();
        
        // Check network connectivity before loading data
        const isConnected = await isNetworkConnected();
        if (!isConnected) {
          console.log('No network connection - loading cached data only');
          // Still try to load basic data even without network
          await Promise.all([
            loadAssignedContracts(currentUser.userData),
            loadNotifications(currentUser.userData),
            cleanupDismissedNotifications()
          ]);
        } else {
          // Load all data including deadline processing
          await Promise.all([
            loadAssignedContracts(currentUser.userData),
            loadNotifications(currentUser.userData),
            cleanupDismissedNotifications(),
            processExistingContractsForDeadlines()
          ]);
        }
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

  const loadAssignedContracts = async (userData: any) => {
    try {
      const currentUser = await getCurrentUserWithData();
      if (!currentUser?.uid) {
        console.error('No current user found');
        return;
      }
      
      // Get contracts assigned to this legal assistant
      const contracts = await getContractsByUser(
        currentUser.uid, 
        userData.role, 
        userData.organizationId
      );
      
      // Filter to only show contracts assigned to this legal assistant
      const assignedContracts = contracts.filter((contract: any) => 
        contract.assignedTo === currentUser.uid
      );
      
      // Sort by assignment date (newest first) and take first 3
      const sortedContracts = assignedContracts
        .sort((a: any, b: any) => {
          const aDate = a.assignedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
          const bDate = b.assignedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
          return bDate.getTime() - aDate.getTime();
        })
        .slice(0, 3);
      
      setAssignedContracts(sortedContracts);
    } catch (error: any) {
      console.error('Error loading assigned contracts:', error);
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

      // Generate dynamic notifications based on assigned contracts
      const dynamicNotifications = await generateDynamicNotifications();
      
      // Combine real and dynamic notifications
      const allNotifications = [...notificationsData, ...dynamicNotifications];
      
      // Sort by timestamp (newest first) with proper null checks
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
        } as Notification))
        .filter((notification: Notification) => {
          // Filter out dismissed notifications
          const notificationKey = `${notification.message}_${notification.createdAt?.toDate?.()?.getTime()}`;
          const isDismissed = dismissedNotifications.has(notificationKey);
          return !isDismissed;
        });
      
      setNotifications(sortedNotifications);
    } catch (error: any) {
      console.error('Error loading notifications:', error);
    }
  };

  const dismissNotification = async (notificationId: string) => {
    try {
      // Remove from local state immediately
      setNotifications(prevNotifications => 
        prevNotifications.filter(notification => {
          const notificationKey = `${notification.message}_${notification.createdAt?.toDate?.()?.getTime()}`;
          return notificationKey !== notificationId;
        })
      );
      
      // For dynamic notifications, just add to dismissed set
      const newDismissed = new Set(dismissedNotifications);
      newDismissed.add(notificationId);
      setDismissedNotifications(newDismissed);
      saveDismissedNotifications(newDismissed);
      
      // For real Firebase notifications, delete from database
      const currentUser = await getCurrentUserWithData();
      if (currentUser?.uid) {
        // Extract the message from the notificationId (format: message_timestamp)
        const message = notificationId.split('_').slice(0, -1).join('_');
        
        // Find the notification in Firebase and delete it
        const notificationsRef = collection(db, 'notifications');
        const q = query(
          notificationsRef,
          where('userId', '==', currentUser.uid),
          where('message', '==', message)
        );
        const querySnapshot = await getDocs(q);
        
        // Delete all matching notifications
        const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        
        // Clear the dismissed notification from AsyncStorage since it's now deleted from Firebase
        if (querySnapshot.docs.length > 0) {
          await clearDismissedNotificationsFromStorage([notificationId]);
        }
      }
    } catch (error) {
      console.error('Error dismissing notification:', error);
    }
  };

  const dismissAllNotifications = async () => {
    try {
      // Clear local state immediately
      setNotifications([]);
      
      // Clear dismissed notifications storage
      setDismissedNotifications(new Set());
      await AsyncStorage.removeItem('dismissedNotifications');
      
      // Delete all real notifications from Firebase
      const currentUser = await getCurrentUserWithData();
      if (currentUser?.uid) {
        const notificationsRef = collection(db, 'notifications');
        const q = query(notificationsRef, where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        // Delete all notifications
        const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        
        // Clear all dismissed notifications from AsyncStorage since they're now deleted from Firebase
        await clearDismissedNotificationsFromStorage([]);
      }
    } catch (error) {
      console.error('Error dismissing all notifications:', error);
    }
  };

  const generateDynamicNotifications = async () => {
    const dynamicNotifications: any[] = [];
    const currentDate = new Date();
    
    // Get assigned contracts for notification generation
    const currentUser = await getCurrentUserWithData();
    if (!currentUser?.uid) {
      return dynamicNotifications;
    }
    
    const assignedContracts = await getContractsByUser(
      currentUser.uid, 
      userData?.role, 
      userData?.organizationId
    );
    
    // Filter to only assigned contracts
    const myAssignedContracts = assignedContracts.filter((contract: any) => 
      contract.assignedTo === currentUser.uid
    );
    
    // Check contracts for deadlines and status changes
    for (const contract of myAssignedContracts) {
      if (!contract) continue;
      
      const contractDate = contract.createdAt?.toDate?.() || new Date();
      const daysSinceUpload = Math.floor((currentDate.getTime() - contractDate.getTime()) / (1000 * 60 * 60 * 24));
      const contractId = (contract as any).id || `contract_${Math.random()}`;
      
      // Contract assignment notification
      if (contract.assignedTo === currentUser.uid && daysSinceUpload <= 1) {
        dynamicNotifications.push({
          id: `assignment_${contractId}`,
          userId: contract.uploadedBy,
          message: `Contract "${contract.title}" has been assigned to you for review.`,
          type: 'assignment',
          read: false,
          createdAt: contractDate,
          contractId: contractId
        });
      }
      
      // Deadline warnings (if contract has deadline)
      const deadline = contract.deadline;
      if (deadline) {
        try {
          const deadlineDate = deadline.toDate();
          const daysRemaining = calculateDaysRemaining(deadlineDate);
          
          // Show notifications for contracts with deadlines within 30 days
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
      } else {
        // Check if contract has deadline information in extractedClauses
        if (contract.extractedClauses) {
          
          // Check both English and Arabic deadline text
          let deadlineText = null;
          if (contract.extractedClauses.en && contract.extractedClauses.en.extracted_clauses && contract.extractedClauses.en.extracted_clauses.deadlines) {
            deadlineText = contract.extractedClauses.en.extracted_clauses.deadlines;
          } else if (contract.extractedClauses.ar && contract.extractedClauses.ar.extracted_clauses && contract.extractedClauses.ar.extracted_clauses.deadlines) {
            deadlineText = contract.extractedClauses.ar.extracted_clauses.deadlines;
          }
          
          if (deadlineText && deadlineText !== 'No specific deadlines found') {
            
            // Check network connectivity before making API calls
            const isConnected = await isNetworkConnected();
            if (!isConnected) {
              console.log(`No network connection - skipping deadline processing for contract ${contract.title}`);
              continue;
            }
            
            // Process the deadline text to get actual date
            try {
              const { parseDeadlineFromText } = await import('../openaiServices');
              const parsedDeadline = await parseDeadlineFromText(deadlineText);
              
              if (parsedDeadline) {
                const daysRemaining = calculateDaysRemaining(parsedDeadline);
                
                // Show notifications for contracts with deadlines within 30 days
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
              }
            } catch (error: any) {
              // Handle network errors gracefully - don't show error for network issues
              if (error?.message?.includes('Network Error') || error?.code === 'NETWORK_ERROR') {
                console.log(`Network error processing deadline for contract ${contract.title} - skipping`);
              } else {
                console.error(`Error processing deadline text for contract ${contract.title}:`, error);
              }
            }
          }
        }
      }
    }
    
    return dynamicNotifications;
  };

  // Function to manually process existing contracts for deadlines
  const processExistingContractsForDeadlines = async () => {
    try {
      const currentUser = await getCurrentUserWithData();
      if (!currentUser?.uid || !currentUser?.userData) {
        console.error('No current user or user data found');
        return;
      }

      // Get assigned contracts for the current user
      const contracts = await getContractsByUser(
        currentUser.uid,
        currentUser.userData.role,
        currentUser.userData.organizationId || undefined
      );

      // Filter to only assigned contracts
      const assignedContracts = contracts.filter((contract: any) => 
        contract.assignedTo === currentUser.uid
      );

      for (const contract of assignedContracts) {
        // Skip contracts that already have deadlines
        if (contract.deadline) {
          continue;
        }

        // Check if contract has analysis with deadline information
        if (contract.extractedClauses) {
          
          // Check both English and Arabic deadline text
          let deadlineText = null;
          if (contract.extractedClauses.en && contract.extractedClauses.en.extracted_clauses && contract.extractedClauses.en.extracted_clauses.deadlines) {
            deadlineText = contract.extractedClauses.en.extracted_clauses.deadlines;
          } else if (contract.extractedClauses.ar && contract.extractedClauses.ar.extracted_clauses && contract.extractedClauses.ar.extracted_clauses.deadlines) {
            deadlineText = contract.extractedClauses.ar.extracted_clauses.deadlines;
          }
          
          if (deadlineText && deadlineText !== 'No specific deadlines found') {
            
            // Check network connectivity before making API calls
            const isConnected = await isNetworkConnected();
            if (!isConnected) {
              console.log(`No network connection - skipping deadline update for contract ${contract.title}`);
              continue;
            }
            
            // Import the deadline parsing function
            try {
              const { updateContractWithDeadline } = await import('../openaiServices');
              await updateContractWithDeadline(contract.id, deadlineText);
            } catch (error: any) {
              // Handle network errors gracefully - don't show error for network issues
              if (error?.message?.includes('Network Error') || error?.code === 'NETWORK_ERROR') {
                console.log(`Network error updating deadline for contract ${contract.title} - skipping`);
              } else {
                console.error(`Error updating deadline for contract ${contract.title}:`, error);
              }
            }
          }
        }
      }

    } catch (error) {
      console.error('Error processing contracts for deadlines:', error);
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
      case 'assigned':
        return '#ffc107';
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
      case 'assigned':
        return '📋 Assigned';
      case 'uploaded':
        return '📄 Uploaded';
      default:
        return '📄 Uploaded';
    }
  };

  const handleContractPress = (contract: any) => {
    navigation.navigate('LegalAssistantContractDetail', { contractId: contract.id || '' });
  };

  const handleViewAllContracts = () => {
    navigation.navigate('LegalAssistantContractList');
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
        Assigned: {item.assignedAt?.toDate?.()?.toLocaleDateString() || item.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown date'}
      </Text>
    </TouchableOpacity>
  );

  const renderNotificationCard = ({ item }: { item: Notification }) => {
    const getNotificationIcon = () => {
      if (item.message.includes('🚨')) return '🚨';
      if (item.message.includes('⚠️')) return '⚠️';
      if (item.message.includes('assigned')) return '📋';
      if (item.message.includes('approved')) return '✅';
      if (item.message.includes('rejected')) return '❌';
      if (item.message.includes('analyzed')) return '📊';
      return '📢';
    };

    const getNotificationColor = () => {
      if (item.message.includes('🚨')) return '#dc3545';
      if (item.message.includes('⚠️')) return '#ffc107';
      if (item.message.includes('assigned')) return '#ffc107';
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
        <Text style={styles.headerTitle}>Legal Assistant Dashboard</Text>
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
          { type: 'contracts', data: assignedContracts },
          { type: 'notifications', data: notifications }
        ]}
        renderItem={({ item }) => {
          if (item.type === 'contracts') {
            return (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Assigned Contracts</Text>
                  <TouchableOpacity onPress={handleViewAllContracts}>
                    <Text style={styles.viewAllLink}>View All</Text>
                  </TouchableOpacity>
                </View>
                
                {item.data.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No contracts assigned yet</Text>
                    <Text style={styles.emptySubtext}>Contracts assigned by admin will appear here</Text>
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
                    <Text style={styles.emptySubtext}>You'll see notifications here for contract assignments and deadlines</Text>
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
}); 
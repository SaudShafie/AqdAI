import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { RootStackParamList } from '../App';
import { getCurrentUserWithData, type ExtendedUser } from '../auth';
import { db } from '../firebase';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminUserManagement'>;

interface OrganizationUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

type UserRole = 'creator' | 'admin' | 'org_user' | 'legal_assistant' | 'viewer';

const roleOptions = [
  { value: 'admin', label: 'Administrator', description: 'Full system access and management' },
  { value: 'org_user', label: 'Organization User', description: 'Standard organization member' },
  { value: 'legal_assistant', label: 'Legal Assistant', description: 'Legal team member' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access' }
];

export default function AdminUserManagement({ navigation }: Props) {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<OrganizationUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('org_user');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchQuery]);

  const loadUserData = async () => {
    try {
      console.log('AdminUserManagement: Loading user data...');
      const userWithData = await getCurrentUserWithData();
      console.log('AdminUserManagement: User data loaded:', userWithData?.userData);
      setUser(userWithData);
      if (userWithData?.userData?.organizationId) {
        console.log('AdminUserManagement: Loading users for organization:', userWithData.userData.organizationId);
        loadOrganizationUsers(userWithData.userData.organizationId);
      } else {
        console.log('AdminUserManagement: No organization ID found');
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizationUsers = async (organizationId: string) => {
    try {
      setRefreshing(true);
      console.log('AdminUserManagement: Querying users for organization:', organizationId);
      
      const usersRef = collection(db, 'users');
      const usersQuery = query(
        usersRef,
        where('organizationId', '==', organizationId)
      );
      const usersSnapshot = await getDocs(usersQuery);
      
      console.log('AdminUserManagement: Found users in database:', usersSnapshot.size);
      
      const usersData: OrganizationUser[] = usersSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('AdminUserManagement: User data:', { id: doc.id, ...data });
        return {
          id: doc.id,
          ...data
        } as OrganizationUser;
      });

      console.log('AdminUserManagement: Processed users:', usersData.length);
      setUsers(usersData);
    } catch (error: any) {
      console.error('Error loading organization users:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(user =>
        user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredUsers(filtered);
  };

  const handleUpdateUserRole = async (userId: string, role: UserRole) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        role: role,
        status: 'approved'
      });
      
      Alert.alert('Success', 'User role updated successfully');
      setShowRoleModal(false);
      loadOrganizationUsers(user?.userData?.organizationId || '');
    } catch (error: any) {
      console.error('Error updating user role:', error);
      Alert.alert('Update Failed', 'Unable to update user role. Please try again.');
    }
  };

  const handleRejectUser = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: 'rejected'
      });
      
      Alert.alert('Success', 'User rejected successfully');
      loadOrganizationUsers(user?.userData?.organizationId || '');
    } catch (error: any) {
      console.error('Error rejecting user:', error);
      Alert.alert('Rejection Failed', 'Unable to reject user. Please try again.');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: 'deleted'
      });
      
      Alert.alert('Success', 'User deleted successfully');
      loadOrganizationUsers(user?.userData?.organizationId || '');
    } catch (error: any) {
      console.error('Error deleting user:', error);
      Alert.alert('Deletion Failed', 'Unable to delete user. Please try again.');
    }
  };

  const openRoleSelection = (userItem: OrganizationUser) => {
    setSelectedUser(userItem);
    setSelectedRole(userItem.role as UserRole || 'org_user');
    setShowRoleModal(true);
  };

  const confirmApproveWithRole = () => {
    if (!selectedUser) return;
    
    handleUpdateUserRole(selectedUser.id, selectedRole);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#28a745';
      case 'pending': return '#ffc107';
      case 'rejected': return '#dc3545';
      case 'deleted': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return 'Approved';
      case 'pending': return 'Pending';
      case 'rejected': return 'Rejected';
      case 'deleted': return 'Deleted';
      default: return 'Unknown';
    }
  };

  const getRoleDisplayText = (role: string) => {
    if (!role) return 'No Role Assigned';
    switch (role) {
      case 'creator': return 'Organization Creator';
      case 'admin': return 'Administrator';
      case 'org_user': return 'Organization User';
      case 'legal_assistant': return 'Legal Assistant';
      case 'viewer': return 'Viewer';
      case 'standalone': return 'Standalone';
      default: return role;
    }
  };

  const renderUserItem = ({ item }: { item: OrganizationUser }) => {
    const isCurrentUser = item.id === user?.uid;
    const isCreator = item.role === 'creator';
    
    return (
      <View style={[
        styles.userCard,
        isCreator && styles.creatorCard
      ]}>
        <View style={styles.userHeader}>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {item.fullName}
              {isCurrentUser && <Text style={styles.currentUserBadge}> (You)</Text>}
              {isCreator && <Text style={styles.creatorBadge}> 👑</Text>}
            </Text>
            <Text style={styles.userEmail}>{item.email}</Text>
          </View>
        </View>
        
        <View style={styles.userDetails}>
          <Text style={[
            styles.userRole,
            !item.role && styles.userRoleNoRole,
            isCreator && styles.creatorRole
          ]}>
            {getRoleDisplayText(item.role)}
          </Text>
        </View>
        
        <View style={styles.actionButtons}>
          {item.status === 'pending' ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                onPress={() => openRoleSelection(item)}
              >
                <Text style={styles.approveButtonText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => handleRejectUser(item.id)}
              >
                <Text style={styles.rejectButtonText}>Reject</Text>
              </TouchableOpacity>
            </>
          ) : item.status === 'approved' && !isCurrentUser && !isCreator ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.changeRoleButton]}
                onPress={() => openRoleSelection(item)}
              >
                <Text style={styles.changeRoleButtonText}>Change Role</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => {
                  if (isCreator) {
                    Alert.alert(
                      'Cannot Delete Creator',
                      'Organization creators cannot be deleted. This is a protected role.',
                      [{ text: 'OK', style: 'default' }]
                    );
                    return;
                  }
                  
                  Alert.alert(
                    'Delete User',
                    `Are you sure you want to delete ${item.fullName}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteUser(item.id) }
                    ]
                  );
                }}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </>
          ) : item.status === 'approved' && isCreator ? (
            <View style={styles.creatorMessage}>
              <Text style={styles.creatorMessageText}>
                Organization Creator - Cannot be modified
              </Text>
            </View>
          ) : item.status === 'approved' && isCurrentUser ? (
            <View style={styles.currentUserMessage}>
              <Text style={styles.currentUserMessageText}>
                You cannot modify your own account
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading user management...</Text>
      </View>
    );
  }

  if (!user?.userData?.organizationId) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Error: No organization found</Text>
        <Text style={{ marginTop: 10, color: '#666' }}>
          Please contact support if this error persists.
        </Text>
      </View>
    );
  }

  const pendingUsers = users.filter(u => u.status === 'pending');
  const approvedUsers = users.filter(u => u.status === 'approved');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>User Management</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{users.length}</Text>
          <Text style={styles.statLabel}>Total Users</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{pendingUsers.length}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{approvedUsers.length}</Text>
          <Text style={styles.statLabel}>Approved</Text>
        </View>
      </View>

      {/* Search Section */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search users by name or email..."
          placeholderTextColor="#adb5bd"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.contentContainer}>
        <FlatList
          data={filteredUsers}
          renderItem={renderUserItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadOrganizationUsers(user?.userData?.organizationId || '')}
              colors={['#007aff']}
              tintColor="#007aff"
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No users found</Text>
              <Text style={styles.emptySubtext}>
                {refreshing ? 'Loading users...' : 
                 searchQuery ? 
                 'No users match your search' : 
                 'No users have registered for your organization yet.'}
              </Text>
            </View>
          }
        />
      </View>

      {/* Role Selection Modal */}
      <Modal
        visible={showRoleModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRoleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {selectedUser?.status === 'pending' ? 'Approve User' : 'Change User Role'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {selectedUser?.status === 'pending' 
                ? `Approve ${selectedUser?.fullName} and assign a role:`
                : `Change role for ${selectedUser?.fullName}:`
              }
            </Text>

            {roleOptions.map((role) => (
              <TouchableOpacity
                key={role.value}
                style={[
                  styles.roleOption,
                  selectedRole === role.value && styles.roleOptionSelected
                ]}
                onPress={() => setSelectedRole(role.value as UserRole)}
              >
                <View style={styles.roleOptionContent}>
                  <Text style={[
                    styles.roleOptionTitle,
                    selectedRole === role.value && styles.roleOptionTitleSelected
                  ]}>
                    {role.label}
                  </Text>
                  <Text style={styles.roleOptionDescription}>
                    {role.description}
                  </Text>
                </View>
                {selectedRole === role.value && (
                  <View style={styles.checkmarkCircle}>
                    <Text style={styles.checkmark}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowRoleModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confirmApproveWithRole}
              >
                <Text style={styles.confirmButtonText}>
                  {selectedUser?.status === 'pending' ? 'Approve' : 'Update Role'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6c757d',
    fontWeight: '500',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  searchInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e9ecef',
    color: '#2c3e50',
  },
  contentContainer: {
    flex: 1,
  },
  listContainer: {
    padding: 15,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f8f9fa',
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  userInfo: {
    flex: 1,
    marginRight: 10,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
    color: '#6c757d',
  },

  userDetails: {
    marginBottom: 8,
  },
  userRole: {
    fontSize: 11,
    color: '#6c757d',
    fontWeight: '500',
  },
  userRoleNoRole: {
    color: '#dc3545',
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#28a745',
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  rejectButton: {
    backgroundColor: '#dc3545',
  },
  rejectButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  changeRoleButton: {
    backgroundColor: '#007bff',
  },
  changeRoleButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f8f9fa',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6c757d',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 18,
  },
  roleOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  roleOptionSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#007bff',
    borderWidth: 2,
  },
  roleOptionContent: {
    flex: 1,
  },
  roleOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  roleOptionTitleSelected: {
    color: '#007bff',
  },
  roleOptionDescription: {
    fontSize: 11,
    color: '#6c757d',
    marginTop: 2,
    lineHeight: 14,
  },
  checkmarkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  checkmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    width: '100%',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    minHeight: 36,
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#28a745',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 18,
  },
  currentUserBadge: {
    fontSize: 11,
    color: '#dc3545',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  currentUserMessage: {
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  currentUserMessageText: {
    fontSize: 11,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  creatorCard: {
    borderColor: '#ffc107',
    borderWidth: 2,
  },
  creatorBadge: {
    fontSize: 12,
    color: '#ffc107',
    marginLeft: 4,
  },
  creatorRole: {
    color: '#ffc107',
  },
  creatorMessage: {
    backgroundColor: '#fff3cd',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  creatorMessageText: {
    fontSize: 11,
    color: '#856404',
    fontWeight: '600',
    fontStyle: 'italic',
  },
}); 
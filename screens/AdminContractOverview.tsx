import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { RootStackParamList } from '../App';
import { getCurrentUserWithData, type ExtendedUser } from '../auth';
import { db } from '../firebase';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminContractOverview'>;

interface OrganizationContract {
  id: string;
  title: string;
  fileName?: string;
  status: 'uploaded' | 'analyzed' | 'assigned' | 'reviewed' | 'approved' | 'rejected';
  category?: string;
  uploadedBy: string;
  uploadedByName?: string;
  createdAt: any;
  riskLevel?: string;
}

export default function AdminContractOverview({ navigation }: Props) {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [contracts, setContracts] = useState<OrganizationContract[]>([]);
  const [filteredContracts, setFilteredContracts] = useState<OrganizationContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'uploaded' | 'analyzed' | 'assigned' | 'reviewed' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    filterContracts();
  }, [contracts, searchQuery, statusFilter]);

  const loadUserData = async () => {
    try {
      const userWithData = await getCurrentUserWithData();
      setUser(userWithData);
      if (userWithData?.userData?.organizationId) {
        loadOrganizationContracts(userWithData.userData.organizationId);
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizationContracts = async (organizationId?: string) => {
    const orgId = organizationId || user?.userData?.organizationId;
    if (!orgId) return;

    try {
      setRefreshing(true);
      const contractsRef = collection(db, 'contracts');
      const contractsQuery = query(
        contractsRef,
        where('organizationId', '==', orgId)
      );
      const contractsSnapshot = await getDocs(contractsQuery);
      
      const contractsData: OrganizationContract[] = [];
      
      for (const docSnapshot of contractsSnapshot.docs) {
        const data = docSnapshot.data();
        
        // Extract risk level from separate field or fallback to analysis data
        let riskLevel = data.riskLevel;
        let needsUpdate = false;
        
        if ((!riskLevel || riskLevel === 'Unknown') && data.extractedClauses) {
          // Try to get risk level from English analysis first
          if (data.extractedClauses.en?.risk_level) {
            riskLevel = data.extractedClauses.en.risk_level;
            needsUpdate = true;
          } else if (data.extractedClauses.ar?.risk_level) {
            // If no English, try Arabic and convert to English
            const arRisk = data.extractedClauses.ar.risk_level;
            riskLevel = arRisk === 'عالي' ? 'High' : 
                       arRisk === 'متوسط' ? 'Medium' : 
                       arRisk === 'منخفض' ? 'Low' : arRisk;
            needsUpdate = true;
          }
        }
        
        // Update the contract in database if risk level was found but not saved
        if (needsUpdate && riskLevel && riskLevel !== 'Unknown') {
          try {
            await updateDoc(doc(db, 'contracts', docSnapshot.id), {
              riskLevel: riskLevel
            });
            console.log('Updated risk level for contract:', data.title, 'to:', riskLevel);
          } catch (error) {
            console.error('Failed to update risk level for contract:', data.title, error);
          }
        }
        
        contractsData.push({
          id: docSnapshot.id,
          ...data,
          riskLevel
        } as OrganizationContract);
      }

      // Sort by creation date (newest first)
      const sortedContracts = contractsData.sort((a, b) => 
        b.createdAt.toDate() - a.createdAt.toDate()
      );

      setContracts(sortedContracts);
    } catch (error) {
      console.error('Error loading organization contracts:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const filterContracts = () => {
    let filtered = contracts;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(contract =>
        contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (contract.category && contract.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (contract.uploadedByName && contract.uploadedByName.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(contract => contract.status === statusFilter);
    }

    setFilteredContracts(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#28a745';
      case 'analyzed': return '#17a2b8';
      case 'uploaded': return '#ffc107';
      case 'assigned': return '#fd7e14';
      case 'reviewed': return '#6f42c1';
      case 'rejected': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return 'Approved';
      case 'analyzed': return 'Analyzed';
      case 'uploaded': return 'Pending';
      case 'assigned': return 'Assigned';
      case 'reviewed': return 'Reviewed';
      case 'rejected': return 'Rejected';
      default: return 'Unknown';
    }
  };

  const getRiskLevelColor = (riskLevel?: string) => {
    switch (riskLevel?.toLowerCase()) {
      case 'high': return '#dc3545';
      case 'medium': return '#ffc107';
      case 'low': return '#28a745';
      default: return '#6c757d';
    }
  };

  const renderContractItem = ({ item }: { item: OrganizationContract }) => (
    <TouchableOpacity
      style={styles.contractCard}
      onPress={() => navigation.navigate('AdminContractDetail', { contractId: item.id })}
    >
      <View style={styles.contractHeader}>
        <Text style={styles.contractTitle}>{item.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
        </View>
      </View>
      
      <View style={styles.contractDetails}>
        <Text style={styles.contractInfo}>
          Category: {item.category || 'Uncategorized'}
        </Text>
        <Text style={styles.contractInfo}>
          Uploaded: {item.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
        </Text>
        {item.uploadedByName && (
          <Text style={styles.contractInfo}>
            By: {item.uploadedByName}
          </Text>
        )}
        <View style={styles.riskContainer}>
          <Text style={styles.riskLabel}>Risk Level: </Text>
          <Text style={[styles.riskLevel, { color: getRiskLevelColor(item.riskLevel) }]}>
            {item.riskLevel || 'Unknown'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const analyzedContracts = contracts.filter(c => c.status === 'analyzed');
  const approvedContracts = contracts.filter(c => c.status === 'approved');
  const pendingContracts = contracts.filter(c => c.status === 'uploaded' || c.status === 'analyzed' || c.status === 'assigned');
  const rejectedContracts = contracts.filter(c => c.status === 'rejected');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>All Contracts</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{contracts.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{approvedContracts.length}</Text>
          <Text style={styles.statLabel}>Approved</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{pendingContracts.length}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{rejectedContracts.length}</Text>
          <Text style={styles.statLabel}>Rejected</Text>
        </View>
      </View>

      {/* Search and Filter Section */}
      <View style={styles.searchFilterContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search contracts..."
          placeholderTextColor="#adb5bd"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterScrollView}
          contentContainerStyle={styles.filterContentContainer}
        >
          <TouchableOpacity
            style={[styles.filterButton, statusFilter === 'all' && styles.filterButtonActive]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[styles.filterButtonText, statusFilter === 'all' && styles.filterButtonTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, statusFilter === 'uploaded' && styles.filterButtonActive]}
            onPress={() => setStatusFilter('uploaded')}
          >
            <Text style={[styles.filterButtonText, statusFilter === 'uploaded' && styles.filterButtonTextActive]}>
              Pending
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, statusFilter === 'analyzed' && styles.filterButtonActive]}
            onPress={() => setStatusFilter('analyzed')}
          >
            <Text style={[styles.filterButtonText, statusFilter === 'analyzed' && styles.filterButtonTextActive]}>
              Analyzed
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, statusFilter === 'assigned' && styles.filterButtonActive]}
            onPress={() => setStatusFilter('assigned')}
          >
            <Text style={[styles.filterButtonText, statusFilter === 'assigned' && styles.filterButtonTextActive]}>
              Assigned
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, statusFilter === 'approved' && styles.filterButtonActive]}
            onPress={() => setStatusFilter('approved')}
          >
            <Text style={[styles.filterButtonText, statusFilter === 'approved' && styles.filterButtonTextActive]}>
              Approved
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, statusFilter === 'rejected' && styles.filterButtonActive]}
            onPress={() => setStatusFilter('rejected')}
          >
            <Text style={[styles.filterButtonText, statusFilter === 'rejected' && styles.filterButtonTextActive]}>
              Rejected
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <FlatList
        data={filteredContracts}
        renderItem={renderContractItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadOrganizationContracts}
            colors={['#007aff']}
            tintColor="#007aff"
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No contracts found</Text>
            <Text style={styles.emptySubtext}>
              {refreshing ? 'Loading contracts...' : 
               searchQuery || statusFilter !== 'all' ? 
               'No contracts match your filters' : 
               'Contracts uploaded by organization members will appear here'}
            </Text>
          </View>
        }
      />
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
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    flexWrap: 'wrap',
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
    minWidth: '18%',
    marginHorizontal: 2,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 3,
  },
  statLabel: {
    fontSize: 11,
    color: '#6c757d',
    fontWeight: '500',
  },
  searchFilterContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  searchInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#e9ecef',
    color: '#2c3e50',
    marginBottom: 8,
  },
  filterScrollView: {
    flexGrow: 0,
  },
  filterContentContainer: {
    paddingRight: 20,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    minWidth: 70,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  filterButtonText: {
    fontSize: 11,
    color: '#6c757d',
    fontWeight: '500',
    textAlign: 'center',
  },
  filterButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    padding: 12,
  },
  contractCard: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#f8f9fa',
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
    marginRight: 6,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  contractDetails: {
    gap: 3,
  },
  contractInfo: {
    fontSize: 10,
    color: '#6c757d',
  },
  riskContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  riskLabel: {
    fontSize: 10,
    color: '#6c757d',
  },
  riskLevel: {
    fontSize: 10,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyText: {
    fontSize: 14,
    color: '#2c3e50',
    marginBottom: 6,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 16,
  },
}); 
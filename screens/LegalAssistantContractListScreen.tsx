// screens/LegalAssistantContractListScreen.tsx
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentUserWithData } from '../auth';
import { getContractsByUser, type Contract } from '../firebaseServices';

interface LegalAssistantContractListScreenProps {
  navigation: any;
}

export default function LegalAssistantContractListScreen({ navigation }: LegalAssistantContractListScreenProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filteredContracts, setFilteredContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [userData, setUserData] = useState<any>(null);

  const categories = ['all', 'employment', 'service', 'partnership', 'nda', 'lease', 'other'];

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadContracts();
    }, [])
  );

  useEffect(() => {
    filterContracts();
  }, [contracts, searchQuery, selectedCategory]);

  const loadContracts = async () => {
    try {
      setLoading(true);
      const currentUser = await getCurrentUserWithData();
      if (currentUser?.userData) {
        setUserData(currentUser.userData);
        
        // Get all contracts for the organization
        const allContracts = await getContractsByUser(
          currentUser.uid,
          currentUser.userData.role,
          currentUser.userData.organizationId || undefined
        );

        // Filter to only show contracts assigned to this legal assistant
        const assignedContracts = allContracts.filter((contract: any) => 
          contract.assignedTo === currentUser.uid
        );
        
        // Sort by assignment date (newest first)
        const sortedContracts = assignedContracts.sort((a: any, b: any) => {
          const aDate = a.assignedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
          const bDate = b.assignedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
          return bDate.getTime() - aDate.getTime();
        });
        
        setContracts(sortedContracts);
      }
    } catch (error: any) {
      console.error('Error loading contracts:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContracts();
    setRefreshing(false);
  };

  const filterContracts = () => {
    let filtered = contracts;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(contract =>
        contract.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (contract.category && contract.category.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(contract => contract.category === selectedCategory);
    }

    setFilteredContracts(filtered);
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
        return '#fd7e14';
      case 'uploaded':
        return '#6c757d';
      default:
        return '#007bff';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'analyzed':
        return 'Analyzed';
      case 'assigned':
        return 'Assigned';
      case 'uploaded':
        return 'Uploaded';
      default:
        return 'Uploaded';
    }
  };

  const handleContractPress = (contract: any) => {
    navigation.navigate('LegalAssistantContractDetail', { contractId: contract.id || '' });
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown date';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString();
    } catch {
      return 'Unknown date';
    }
  };

  const renderContractItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.contractCard}
      onPress={() => handleContractPress(item)}
    >
      <View style={styles.contractHeader}>
        <Text style={styles.contractTitle} numberOfLines={2}>
          {item.title || 'Untitled Contract'}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusBadgeText}>{getStatusText(item.status)}</Text>
        </View>
      </View>
      
      <View style={styles.contractDetails}>
        {item.category && (
          <Text style={styles.contractCategory}>Category: {item.category}</Text>
        )}
        <Text style={styles.contractDate}>
          Assigned: {formatDate(item.assignedAt || item.createdAt)}
        </Text>
        {item.deadline && (
          <Text style={[styles.contractDate, { color: '#dc3545', fontWeight: '600' }]}>
            Deadline: {formatDate(item.deadline)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderCategoryFilter = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={[styles.filterButton, selectedCategory === item && styles.filterButtonActive]}
      onPress={() => setSelectedCategory(item)}
    >
      <Text style={[styles.filterButtonText, selectedCategory === item && styles.filterButtonTextActive]}>
        {item === 'all' ? 'All' : item.charAt(0).toUpperCase() + item.slice(1)}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading assigned contracts...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Assigned Contracts</Text>
        <Text style={styles.headerSubtitle}>
          {filteredContracts.length} of {contracts.length} contracts
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search contracts..."
          placeholderTextColor="#adb5bd"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Category Filters */}
      <View style={styles.filterContainer}>
        <FlatList
          data={categories}
          renderItem={renderCategoryFilter}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
        />
      </View>

      {/* Contracts List */}
      <FlatList
        style={styles.contractsList}
        data={filteredContracts}
        renderItem={renderContractItem}
        keyExtractor={(item, index) => (item as any).id || `contract_${index}`}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#007bff']}
            tintColor="#007bff"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No contracts found</Text>
            <Text style={styles.emptyText}>
              {contracts.length === 0 
                ? 'No contracts have been assigned to you yet.'
                : 'No contracts match your current filters.'
              }
            </Text>
          </View>
        }
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
    paddingVertical: 15,
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
  headerSubtitle: {
    fontSize: 12,
    color: '#6c757d',
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
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 14,
    color: '#2c3e50',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  filterContainer: {
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  filterList: {
    paddingHorizontal: 20,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  filterButtonText: {
    fontSize: 11,
    color: '#6c757d',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  contractsList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 15,
  },
  contractCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  contractHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  contractTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  contractDetails: {
    gap: 4,
  },
  contractCategory: {
    fontSize: 11,
    color: '#6c757d',
  },
  contractDate: {
    fontSize: 10,
    color: '#adb5bd',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6c757d',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#adb5bd',
    textAlign: 'center',
    lineHeight: 18,
  },
}); 
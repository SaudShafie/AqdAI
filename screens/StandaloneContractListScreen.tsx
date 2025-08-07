// screens/StandaloneContractListScreen.tsx
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

interface StandaloneContractListScreenProps {
  navigation: any;
}

export default function StandaloneContractListScreen({ navigation }: StandaloneContractListScreenProps) {
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
        const contractsData = await getContractsByUser(
          currentUser.uid,
          currentUser.userData.role,
          currentUser.userData.organizationId || undefined
        );
        
        // Sort by upload date (newest first)
        const sortedContracts = contractsData.sort((a: any, b: any) => 
          b.createdAt.toDate() - a.createdAt.toDate()
        );
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
        contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
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

  const handleUploadContract = () => {
    navigation.navigate('ContractUpload');
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const renderContractItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.contractItem}
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
      
      <View style={styles.contractDetails}>
        <Text style={styles.contractCategory}>{item.category || 'General'}</Text>
        <Text style={styles.contractDate}>{formatDate(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderCategoryFilter = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={[
        styles.categoryFilter,
        selectedCategory === item && styles.categoryFilterActive
      ]}
      onPress={() => setSelectedCategory(item)}
    >
      <Text style={[
        styles.categoryFilterText,
        selectedCategory === item && styles.categoryFilterTextActive
      ]}>
        {item.charAt(0).toUpperCase() + item.slice(1)}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading contracts...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Contracts</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by contract name or category..."
          placeholderTextColor="#adb5bd"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Category Filters */}
      <View style={styles.categoryContainer}>
        <FlatList
          data={categories}
          renderItem={renderCategoryFilter}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        />
      </View>

      {/* Contracts List */}
      <View style={styles.listContainer}>
        {filteredContracts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery || selectedCategory !== 'all' 
                ? 'No contracts match your filters' 
                : 'No contracts yet'}
            </Text>
            {!searchQuery && selectedCategory === 'all' && (
              <TouchableOpacity style={styles.uploadFirstButton} onPress={handleUploadContract}>
                <Text style={styles.uploadFirstButtonText}>Upload Your First Contract</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredContracts}
            renderItem={renderContractItem}
            keyExtractor={(item, index) => (item as any).id || `contract_${index}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#007bff']}
                tintColor="#007bff"
              />
            }
          />
        )}
      </View>

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
    fontSize: 14,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  categoryContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  categoryList: {
    paddingHorizontal: 20,
  },
  categoryFilter: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  categoryFilterActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  categoryFilterText: {
    fontSize: 12,
    color: '#6c757d',
    fontWeight: '500',
  },
  categoryFilterTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  listContent: {
    paddingBottom: 15,
  },
  contractItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f8f9fa',
  },
  contractHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  contractTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    flex: 1,
    marginRight: 10,
    lineHeight: 18,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  contractDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  contractCategory: {
    fontSize: 11,
    color: '#6c757d',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontWeight: '500',
  },
  contractDate: {
    fontSize: 10,
    color: '#adb5bd',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
    fontWeight: '500',
  },
  uploadFirstButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  uploadFirstButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
}); 
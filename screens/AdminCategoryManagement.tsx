import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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

type Props = NativeStackScreenProps<RootStackParamList, 'AdminCategoryManagement'>;

interface Category {
  id: string;
  name: string;
  displayName?: string;
  createdBy: string;
  createdAt: any;
  organizationId: string;
  isFromContract?: boolean; // Added for contract categories
  contractCount?: number; // Added to show how many contracts use this category
}

export default function AdminCategoryManagement({ navigation }: Props) {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [selectedCategoryForDetails, setSelectedCategoryForDetails] = useState<Category | null>(null);
  const [categoryContracts, setCategoryContracts] = useState<any[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [newCategoryInModal, setNewCategoryInModal] = useState('');
  const [showCategoryDetailsModal, setShowCategoryDetailsModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      console.log('AdminCategoryManagement: Starting loadUserData...');
      const userWithData = await getCurrentUserWithData();
      console.log('AdminCategoryManagement: User data:', userWithData);
      console.log('AdminCategoryManagement: User role:', userWithData?.userData?.role);
      console.log('AdminCategoryManagement: Organization ID:', userWithData?.userData?.organizationId);
      
      if (userWithData?.userData?.organizationId) {
        console.log('AdminCategoryManagement: User has organizationId, loading categories...');
        setUser(userWithData);
        await loadOrganizationCategories(userWithData.userData.organizationId);
      } else if (userWithData?.userData?.role === 'admin' || userWithData?.userData?.role === 'creator') {
        // For admin/creator users without organizationId, try to find their organization
        console.log('AdminCategoryManagement: Admin/creator without organizationId, attempting to find organization...');
        await findAndSetOrganization(userWithData);
      } else {
        console.log('AdminCategoryManagement: Setting user but no organization found');
        setUser(userWithData);
        Alert.alert('Error', 'No organization found. Please contact your administrator.');
      }
    } catch (error: any) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const findAndSetOrganization = async (userWithData: ExtendedUser) => {
    try {
      // Try to find organization by user ID (as creator)
      const organizationsRef = collection(db, 'organizations');
      const orgQuery = query(organizationsRef, where('createdBy', '==', userWithData.uid));
      const orgSnapshot = await getDocs(orgQuery);
      
      if (!orgSnapshot.empty) {
        const orgDoc = orgSnapshot.docs[0];
        const organizationId = orgDoc.id;
        console.log('AdminCategoryManagement: Found organization:', organizationId);
        
        // Update user data with organizationId
        const { updateUserDocument } = await import('../firebaseServices');
        await updateUserDocument(userWithData.uid, { organizationId });
        
        // Update local user state
        const updatedUser = {
          ...userWithData,
          userData: {
            ...userWithData.userData!,
            organizationId
          }
        };
        setUser(updatedUser);
        
        // Now load categories
        await loadOrganizationCategories(organizationId);
      } else {
        console.log('AdminCategoryManagement: No organization found for user');
        Alert.alert('Organization Not Found', 'No organization found. Please contact your administrator.');
      }
    } catch (error) {
      console.error('Error finding organization:', error);
      Alert.alert('Organization Error', 'No organization found for this admin account. Please contact support.');
    }
  };

  const loadOrganizationCategories = async (organizationId?: string) => {
    const targetOrganizationId = organizationId || user?.userData?.organizationId;
    
    if (!targetOrganizationId) {
      console.log('AdminCategoryManagement: No organizationId available for loading categories');
      return;
    }

    try {
      setRefreshing(true);
      console.log('AdminCategoryManagement: Loading categories for organization:', targetOrganizationId);
      
      // 1. Load categories from the categories collection
      const categoriesRef = collection(db, 'categories');
      const categoriesQuery = query(
        categoriesRef,
        where('organizationId', '==', targetOrganizationId)
      );
      const categoriesSnapshot = await getDocs(categoriesQuery);
      
      const formalCategories: Category[] = categoriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Category));

      // 2. Load categories from existing contracts
      const contractsRef = collection(db, 'contracts');
      const contractsQuery = query(
        contractsRef,
        where('organizationId', '==', targetOrganizationId)
      );
      const contractsSnapshot = await getDocs(contractsQuery);
      
      // Extract unique categories from contracts and count contracts per category
      const contractCategories = new Set<string>();
      const categoryContractCounts: { [key: string]: number } = {};
      
      contractsSnapshot.docs.forEach(doc => {
        const contractData = doc.data();
        if (contractData.category && contractData.category.trim()) {
          const categoryName = contractData.category.trim();
          contractCategories.add(categoryName);
          categoryContractCounts[categoryName] = (categoryContractCounts[categoryName] || 0) + 1;
        }
      });

      console.log('AdminCategoryManagement: Contract categories found:', Array.from(contractCategories));
      console.log('AdminCategoryManagement: Category contract counts:', categoryContractCounts);

      // 3. Combine formal categories with contract categories
      const allCategories: Category[] = [...formalCategories];
      
      // Add contract counts to formal categories
      allCategories.forEach(category => {
        const categoryName = category.displayName || category.name;
        category.contractCount = categoryContractCounts[categoryName] || 0;
      });
      
      // Add contract categories that don't exist in formal categories
      contractCategories.forEach(categoryName => {
        const exists = formalCategories.some(cat => 
          cat.name.toLowerCase() === categoryName.toLowerCase() || 
          cat.displayName?.toLowerCase() === categoryName.toLowerCase()
        );
        
        if (!exists) {
          allCategories.push({
            id: `contract-${categoryName}`,
            name: categoryName.toLowerCase(),
            displayName: categoryName,
            createdBy: 'system',
            organizationId: targetOrganizationId,
            createdAt: new Date(),
            isFromContract: true, // Flag to identify categories from contracts
            contractCount: categoryContractCounts[categoryName] || 0
          } as Category);
        }
      });

      console.log('AdminCategoryManagement: Total categories (formal + contract):', allCategories.length);
      console.log('AdminCategoryManagement: All categories:', allCategories);
      
      setCategories(allCategories);
    } catch (error: any) {
      console.error('Error loading organization categories:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const checkCategoryExists = async (categoryName: string): Promise<boolean> => {
    if (!user?.userData?.organizationId) return false;

    try {
      const categoriesRef = collection(db, 'categories');
      const categoriesQuery = query(
        categoriesRef,
        where('organizationId', '==', user.userData.organizationId),
        where('name', '==', categoryName.trim().toLowerCase())
      );
      const categoriesSnapshot = await getDocs(categoriesQuery);
      return !categoriesSnapshot.empty;
    } catch (error) {
      console.error('Error checking category existence:', error);
      return false;
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Missing Information', 'Please enter a category name');
      return;
    }

    if (!user?.userData?.organizationId) {
      Alert.alert('Organization Not Found', 'Organization not found');
      return;
    }

    // Check if category already exists
    const categoryExists = await checkCategoryExists(newCategoryName);
    if (categoryExists) {
      Alert.alert('Error', 'A category with this name already exists');
      return;
    }

    try {
      setIsAdding(true);
      const categoriesRef = collection(db, 'categories');
      await addDoc(categoriesRef, {
        name: newCategoryName.trim().toLowerCase(),
        displayName: newCategoryName.trim(),
        createdBy: user.uid,
        organizationId: user.userData.organizationId,
        createdAt: new Date()
      });

      setNewCategoryName('');
      Alert.alert('Success', 'Category added successfully');
      await loadOrganizationCategories(); // Refresh the list
    } catch (error: any) {
      console.error('Error adding category:', error);
      if (error.message.includes('already exists')) {
        Alert.alert('Duplicate Category', 'A category with this name already exists');
      } else {
        Alert.alert('Add Failed', 'Unable to add category. Please try again.');
      }
    } finally {
      setIsAdding(false);
    }
  };

  const checkCategoryUsage = async (categoryId: string): Promise<number> => {
    if (!user?.userData?.organizationId) return 0;

    try {
      const contractsRef = collection(db, 'contracts');
      const contractsQuery = query(
        contractsRef,
        where('organizationId', '==', user.userData.organizationId),
        where('category', '==', categoryId)
      );
      const contractsSnapshot = await getDocs(contractsQuery);
      return contractsSnapshot.size;
    } catch (error) {
      console.error('Error checking category usage:', error);
      return 0;
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    // Find the category to check if it's from contracts
    const category = categories.find(cat => cat.id === categoryId);
    
    if (category?.isFromContract) {
      Alert.alert(
        'Cannot Delete Category',
        `"${categoryName}" is being used by existing contracts. Categories from contracts cannot be deleted.`,
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    // Check if category is being used
    const usageCount = await checkCategoryUsage(categoryId);
    
    if (usageCount > 0) {
      Alert.alert(
        'Cannot Delete Category',
        `This category is being used by ${usageCount} contract(s). Please reassign or delete those contracts first.`,
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${categoryName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(categoryId);
              const categoryRef = doc(db, 'categories', categoryId);
              await deleteDoc(categoryRef);
              Alert.alert('Success', 'Category deleted successfully');
              await loadOrganizationCategories(); // Refresh the list
            } catch (error) {
              console.error('Error deleting category:', error);
              Alert.alert('Error', 'Failed to delete category');
            } finally {
              setIsDeleting(null);
            }
          },
        },
      ]
    );
  };

  const loadContractsForCategory = async (categoryName: string) => {
    if (!user?.userData?.organizationId) return;

    try {
      setLoadingContracts(true);
      const contractsRef = collection(db, 'contracts');
      const contractsQuery = query(
        contractsRef,
        where('organizationId', '==', user.userData.organizationId),
        where('category', '==', categoryName)
      );
      const contractsSnapshot = await getDocs(contractsQuery);
      
      const contracts = contractsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setCategoryContracts(contracts);
      // setShowContracts(true); // This state variable is removed
    } catch (error) {
      console.error('Error loading contracts for category:', error);
      Alert.alert('Error', 'Failed to load contracts');
    } finally {
      setLoadingContracts(false);
    }
  };

  const updateContractCategory = async (contractId: string, newCategory: string) => {
    try {
      const contractRef = doc(db, 'contracts', contractId);
      await updateDoc(contractRef, { category: newCategory });
      
      Alert.alert('Success', 'Contract category updated successfully');
      
      // Refresh the contracts list
      if (selectedCategoryForDetails) { // Use selectedCategoryForDetails
        await loadContractsForCategory(selectedCategoryForDetails.displayName || selectedCategoryForDetails.name);
      }
      
      // Refresh categories to update counts
      await loadOrganizationCategories();
    } catch (error) {
      console.error('Error updating contract category:', error);
      Alert.alert('Error', 'Failed to update contract category');
    }
  };

  const renderCategoryItem = ({ item }: { item: Category }) => (
    <TouchableOpacity 
      style={[styles.categoryCard, item.isFromContract && styles.contractCategoryCard]}
      onPress={() => {
        setSelectedCategoryForDetails(item);
        loadContractsForCategory(item.displayName || item.name);
        setShowCategoryDetailsModal(true);
      }}
    >
      <View style={styles.categoryInfo}>
        <Text style={styles.categoryName}>{item.displayName || item.name}</Text>
        <Text style={styles.categoryDate}>
          {item.isFromContract ? 'From existing contracts' : `Created: ${item.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}`}
        </Text>
        <Text style={styles.contractCount}>
          {item.contractCount || 0} contract{item.contractCount !== 1 ? 's' : ''}
        </Text>
      </View>
      
      {!item.isFromContract && (
        <TouchableOpacity
          style={[styles.deleteButton, isDeleting === item.id && styles.deleteButtonDisabled]}
          onPress={() => handleDeleteCategory(item.id, item.displayName || item.name)}
          disabled={isDeleting === item.id}
        >
          {isDeleting === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.deleteButtonText}>Delete</Text>
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const showCategoryChangeModal = (contract: any) => {
    setSelectedContract(contract);
    setShowCategoryModal(true);
    setNewCategoryInModal('');
  };

  const handleCategoryChange = async (newCategory: string) => {
    if (!selectedContract) return;
    
    try {
      await updateContractCategory(selectedContract.id, newCategory);
      setShowCategoryModal(false);
      setSelectedContract(null);
      setNewCategoryInModal('');
    } catch (error) {
      console.error('Error changing category:', error);
    }
  };

  const handleAddNewCategoryInModal = async () => {
    if (!newCategoryInModal.trim()) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }

    if (!user?.userData?.organizationId) {
      Alert.alert('Organization Not Found', 'Organization not found');
      return;
    }

    try {
      const categoriesRef = collection(db, 'categories');
      await addDoc(categoriesRef, {
        name: newCategoryInModal.trim().toLowerCase(),
        displayName: newCategoryInModal.trim(),
        createdBy: user.uid,
        organizationId: user.userData.organizationId,
        createdAt: new Date()
      });

      setNewCategoryInModal('');
      Alert.alert('Success', 'Category added successfully');
      
      // Refresh categories to include the new one
      await loadOrganizationCategories();
    } catch (error) {
      console.error('Error adding category:', error);
      Alert.alert('Error', 'Failed to add category');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading categories...</Text>
      </View>
    );
  }

  if (!user?.userData?.organizationId) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No organization found</Text>
        <Text style={styles.errorSubtext}>
          {user?.userData?.role === 'admin' || user?.userData?.role === 'creator' 
            ? 'Please contact support to set up your organization'
            : 'Please contact your administrator'
          }
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <Text style={styles.title}>Category Management</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{categories.length}</Text>
          <Text style={styles.statLabel}>Total Categories</Text>
        </View>
      </View>

      <FlatList
        data={categories}
        renderItem={renderCategoryItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadOrganizationCategories()}
            colors={['#007aff']}
            tintColor="#007aff"
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No categories found</Text>
            <Text style={styles.emptySubtext}>Add your first category to get started</Text>
          </View>
        }
      />

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => setShowAddCategoryModal(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {showCategoryModal && selectedContract && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Category</Text>
            <Text style={styles.modalSubtitle}>Contract: {selectedContract.title}</Text>
            <Text style={styles.modalSubtitle}>Current: {selectedContract.category}</Text>
            
            <View style={styles.existingCategoriesContainer}>
              <Text style={styles.existingCategoriesTitle}>Select from existing categories:</Text>
              <ScrollView style={styles.categoriesList} showsVerticalScrollIndicator={false}>
                {categories
                  .filter(category => (category.displayName || category.name) !== selectedContract.category)
                  .map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categoryOption,
                      newCategoryInModal === (category.displayName || category.name) && styles.selectedCategoryOption
                    ]}
                    onPress={() => setNewCategoryInModal(category.displayName || category.name)}
                  >
                    <Text style={[
                      styles.categoryOptionText,
                      newCategoryInModal === (category.displayName || category.name) && styles.selectedCategoryOptionText
                    ]}>
                      {category.displayName || category.name}
                    </Text>
                    <Text style={styles.categoryOptionCount}>
                      {category.contractCount || 0} contracts
                    </Text>
                  </TouchableOpacity>
                ))}
                {/* Predefined categories */}
                {['employment', 'service', 'partnership', 'nda', 'lease'].map((predefinedCategory) => (
                  <TouchableOpacity
                    key={`predefined-${predefinedCategory}`}
                    style={[
                      styles.categoryOption,
                      newCategoryInModal === predefinedCategory && styles.selectedCategoryOption
                    ]}
                    onPress={() => setNewCategoryInModal(predefinedCategory)}
                  >
                    <Text style={[
                      styles.categoryOptionText,
                      newCategoryInModal === predefinedCategory && styles.selectedCategoryOptionText
                    ]}>
                      {predefinedCategory.charAt(0).toUpperCase() + predefinedCategory.slice(1)}
                    </Text>
                    <Text style={styles.categoryOptionCount}>
                      0 contracts
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            
            <View style={styles.addNewCategoryContainer}>
              <Text style={styles.addNewCategoryTitle}>Or add a new category:</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter new category name"
                placeholderTextColor="#adb5bd"
                value={newCategoryInModal}
                onChangeText={setNewCategoryInModal}
                maxLength={50}
              />
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowCategoryModal(false);
                  setSelectedContract(null);
                  setNewCategoryInModal('');
                  // Redirect back to category details modal
                  if (selectedCategoryForDetails) {
                    setShowCategoryDetailsModal(true);
                  }
                }}
              >
                <Text style={styles.modalCancelButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton]}
                onPress={() => handleCategoryChange(newCategoryInModal)}
                disabled={!newCategoryInModal.trim()}
              >
                <Text style={styles.modalSaveButtonText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showCategoryDetailsModal && selectedCategoryForDetails && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Category Details</Text>
            <Text style={styles.modalSubtitle}>{selectedCategoryForDetails.displayName || selectedCategoryForDetails.name}</Text>
            
            <View style={styles.categoryDetailsInfo}>
              <Text style={styles.categoryDetailsText}>
                Type: {selectedCategoryForDetails.isFromContract ? 'Contract Category' : 'Formal Category'}
              </Text>
              <Text style={styles.categoryDetailsText}>
                Contracts: {selectedCategoryForDetails.contractCount || 0}
              </Text>
              {!selectedCategoryForDetails.isFromContract && (
                <Text style={styles.categoryDetailsText}>
                  Created: {selectedCategoryForDetails.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                </Text>
              )}
            </View>
            
            <View style={styles.contractsListContainer}>
              <Text style={styles.contractsListTitle}>Contracts in this category:</Text>
              {loadingContracts ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : categoryContracts.length === 0 ? (
                <Text style={styles.noContractsText}>No contracts found for this category.</Text>
              ) : (
                <ScrollView style={styles.contractsList} showsVerticalScrollIndicator={false}>
                  {categoryContracts.map((contract) => (
                    <View key={contract.id} style={styles.contractListItem}>
                      <View style={styles.contractListItemInfo}>
                        <Text style={styles.contractListItemTitle}>{contract.title}</Text>
                        <Text style={styles.contractListItemStatus}>Status: {contract.status}</Text>
                        <Text style={styles.contractListItemDate}>
                          Created: {contract.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                        </Text>
                      </View>
                      <View style={styles.contractListItemActions}>
                        <TouchableOpacity
                          style={styles.contractListItemViewButton}
                          onPress={() => {
                            setShowCategoryDetailsModal(false);
                            navigation.navigate('AdminContractDetail', { contractId: contract.id });
                          }}
                        >
                          <Text style={styles.contractListItemViewButtonText}>View</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.contractListItemChangeButton}
                          onPress={() => {
                            setShowCategoryDetailsModal(false);
                            showCategoryChangeModal(contract);
                          }}
                        >
                          <Text style={styles.contractListItemChangeButtonText}>Change</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
            
            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={() => {
                setShowCategoryDetailsModal(false);
                setSelectedCategoryForDetails(null);
                setCategoryContracts([]);
                // Redirect back to the first popup (category change modal)
                if (selectedContract) {
                  setShowCategoryModal(true);
                }
              }}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
              
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Category</Text>
            
            <View style={styles.addCategoryContainer}>
              <Text style={styles.addCategoryTitle}>Category Name:</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter category name"
                placeholderTextColor="#adb5bd"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                autoFocus
                maxLength={50}
              />
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowAddCategoryModal(false);
                  setNewCategoryName('');
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, isAdding && styles.saveButtonDisabled]}
                onPress={async () => {
                  await handleAddCategory();
                  setShowAddCategoryModal(false);
                }}
                disabled={isAdding}
              >
                {isAdding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveButtonText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  errorText: {
    fontSize: 16,
    color: '#dc3545',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#6c757d',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerLeft: {
    width: 60, // Match add button width for proper centering
  },
  headerRight: {
    width: 60, // Match add button width for proper centering
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  addButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#007AFF',
    flex: 0,
    minWidth: 60,
  },
  addForm: {
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  formButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#28a745',
  },
  saveButtonDisabled: {
    backgroundColor: '#6c757d',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    marginBottom: 1,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6c757d',
  },
  listContainer: {
    padding: 16,
  },
  categoryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contractCategoryCard: {
    backgroundColor: '#f0f7fa', // Light blue background for contract categories
    borderColor: '#cce5ff', // Lighter border for contract categories
    borderWidth: 1,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  categoryDate: {
    fontSize: 12,
    color: '#666',
  },
  contractCount: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: '#6c757d',
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxHeight: '65%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '400',
  },
  existingCategoriesContainer: {
    width: '100%',
    marginBottom: 16,
  },
  existingCategoriesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  categoriesList: {
    width: '100%',
    maxHeight: 100,
  },
  categoryOption: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
    minHeight: 40,
  },
  categoryOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1a1a1a',
    flex: 1,
  },
  selectedCategoryOption: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
    borderWidth: 1.5,
  },
  selectedCategoryOptionText: {
    color: '#1976d2',
    fontWeight: '600',
  },
  categoryOptionCount: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  addNewCategoryContainer: {
    width: '100%',
    marginBottom: 16,
  },
  addNewCategoryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    marginBottom: 16,
    backgroundColor: '#fff',
    width: '100%',
    fontWeight: '400',
    minHeight: 40,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 44,
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    padding: 12,
  },
  modalCancelButtonText: {
    color: '#6c757d',
    fontSize: 12,
    fontWeight: '600',
  },
  modalSaveButton: {
    backgroundColor: '#007AFF',
  },
  modalSaveButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  categoryDetailsInfo: {
    width: '100%',
    marginBottom: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
  },
  categoryDetailsText: {
    fontSize: 12,
    color: '#555',
    marginBottom: 4,
    fontWeight: '500',
  },
  contractsListContainer: {
    width: '100%',
    maxHeight: 160,
  },
  contractsListTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  contractsList: {
    width: '100%',
  },
  noContractsText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  contractListItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    minHeight: 50,
  },
  contractListItemInfo: {
    flex: 1,
  },
  contractListItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 3,
  },
  contractListItemStatus: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
    fontWeight: '500',
  },
  contractListItemDate: {
    fontSize: 10,
    color: '#999',
    fontWeight: '400',
  },
  contractListItemActions: {
    flexDirection: 'row',
    gap: 6,
  },
  contractListItemViewButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 45,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 28,
    justifyContent: 'center',
  },
  contractListItemViewButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  contractListItemChangeButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 45,
    alignItems: 'center',
    shadowColor: '#6c757d',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 28,
    justifyContent: 'center',
  },
  contractListItemChangeButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  addCategoryContainer: {
    width: '100%',
    marginBottom: 16,
  },
  addCategoryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
}); 
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../App';
import { getCurrentUserWithData } from '../auth';
import CommentsSection from '../components/CommentsSection';
import { db } from '../firebaseServices';

type Props = NativeStackScreenProps<RootStackParamList, 'OrgContractDetail'>;

interface ContractDetail {
  id: string;
  title: string;
  category: string;
  status: 'uploaded' | 'analyzed' | 'reviewed' | 'approved' | 'rejected';
  uploadedBy: string;
  createdAt: any;
  summary?: string;
  extractedClauses?: any;
  fileName?: string;
  assignedTo?: string;
  approvedBy?: string;
  approvalComment?: string;
}

export default function OrgContractDetailScreen({ navigation, route }: Props) {
  const { contractId } = route.params;
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [userRole, setUserRole] = useState<string>('');
  const [organizationId, setOrganizationId] = useState<string>('');

  useEffect(() => {
    fetchContractDetails();
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const currentUser = await getCurrentUserWithData();
      if (currentUser?.userData) {
        setUserRole(currentUser.userData.role);
        setOrganizationId(currentUser.userData.organizationId || '');
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  };

  const fetchContractDetails = async () => {
    try {
      const contractRef = doc(db, 'contracts', contractId);
      const contractSnap = await getDoc(contractRef);
      
      if (contractSnap.exists()) {
        const contractData = contractSnap.data() as ContractDetail;
        setContract({ ...contractData, id: contractId });
      } else {
        Alert.alert('Error', 'Contract not found');
        navigation.goBack();
      }
    } catch (error: any) {
      console.error('Failed to fetch contract details:', error);
      Alert.alert('Error', 'Failed to load contract details');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Map internal status to org user visible status
  const getOrgUserStatus = (status: string) => {
    switch (status) {
      case 'uploaded':
      case 'analyzed':
      case 'reviewed':
        return 'uploaded';
      case 'approved':
        return 'accepted';
      case 'rejected':
        return 'rejected';
      default:
        return 'uploaded';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return '#28a745';
      case 'rejected':
        return '#dc3545';
      default:
        return '#007bff';
    }
  };

  const getStatusText = (status: string) => {
    const orgStatus = getOrgUserStatus(status);
    switch (orgStatus) {
      case 'accepted':
        return language === 'ar' ? '✓ مقبول' : '✓ Accepted';
      case 'rejected':
        return language === 'ar' ? '❌ مرفوض' : '❌ Rejected';
      default:
        return language === 'ar' ? '📄 مرفوع' : '📄 Uploaded';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading contract details...</Text>
      </View>
    );
  }

  if (!contract) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Contract not found</Text>
      </View>
    );
  }

  const orgStatus = getOrgUserStatus(contract.status);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, language === 'ar' && styles.headerRTL]}>
        <Text style={[styles.title, language === 'ar' && styles.titleRTL]}>
          {language === 'ar' ? 'تفاصيل العقد' : 'Contract Details'}
        </Text>
        
        {/* Language Toggle */}
        <View style={styles.languageToggleContainer}>
          <TouchableOpacity 
            style={[styles.languageButton, language === 'en' && styles.languageButtonActive]} 
            onPress={() => setLanguage('en')}
          >
            <Text style={[styles.languageButtonText, language === 'en' && styles.languageButtonTextActive]}>
              English
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.languageButton, language === 'ar' && styles.languageButtonActive]} 
            onPress={() => setLanguage('ar')}
          >
            <Text style={[styles.languageButtonText, language === 'ar' && styles.languageButtonTextActive]}>
              العربية
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollContainer} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainContent}>
          {/* Contract Information */}
          <View style={[styles.section, language === 'ar' && styles.sectionRTL]}>
            <Text style={[styles.sectionTitle, language === 'ar' && styles.sectionTitleRTL]}>
              {language === 'ar' ? 'معلومات العقد' : 'Contract Information'}
            </Text>
            <View style={styles.infoContainer}>
              <View style={[styles.infoRow, language === 'ar' && styles.infoRowRTL]}>
                <Text style={[styles.infoLabel, language === 'ar' && styles.infoLabelRTL]}>
                  {language === 'ar' ? 'العنوان:' : 'Title:'}
                </Text>
                <Text style={[styles.infoValue, language === 'ar' && styles.infoValueRTL]}>
                  {contract.title}
                </Text>
              </View>
              <View style={[styles.infoRow, language === 'ar' && styles.infoRowRTL]}>
                <Text style={[styles.infoLabel, language === 'ar' && styles.infoLabelRTL]}>
                  {language === 'ar' ? 'الفئة:' : 'Category:'}
                </Text>
                <Text style={[styles.infoValue, language === 'ar' && styles.infoValueRTL]}>
                  {contract.category}
                </Text>
              </View>
              <View style={[styles.infoRow, language === 'ar' && styles.infoRowRTL]}>
                <Text style={[styles.infoLabel, language === 'ar' && styles.infoLabelRTL]}>
                  {language === 'ar' ? 'تاريخ الرفع:' : 'Uploaded:'}
                </Text>
                <Text style={[styles.infoValue, language === 'ar' && styles.infoValueRTL]}>
                  {formatDate(contract.createdAt)}
                </Text>
              </View>
              <View style={[styles.infoRow, language === 'ar' && styles.infoRowRTL]}>
                <Text style={[styles.infoLabel, language === 'ar' && styles.infoLabelRTL]}>
                  {language === 'ar' ? 'الحالة:' : 'Status:'}
                </Text>
                <View style={styles.statusContainer}>
                  <Text style={[styles.statusText, { color: getStatusColor(orgStatus) }]}>
                    {getStatusText(contract.status)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Contract Text */}
          {contract?.summary && (
            <View style={[styles.section, language === 'ar' && styles.sectionRTL]}>
              <Text style={[styles.sectionTitle, language === 'ar' && styles.sectionTitleRTL]}>
                {language === 'ar' ? 'نص العقد' : 'Contract Text'}
              </Text>
              
              <ScrollView 
                style={[styles.contractTextContainer, language === 'ar' && styles.contractTextContainerRTL]}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                <Text style={[styles.contractText, language === 'ar' && styles.contractTextRTL]}>
                  {contract.summary}
                </Text>
              </ScrollView>
            </View>
          )}

          {/* Comments Section */}
          {contract && (
            <View style={[styles.section, language === 'ar' && styles.sectionRTL]}>
              <CommentsSection
                contractId={contractId}
                userRole={userRole}
                language={language}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  contentContainer: {
    paddingBottom: 20,
  },
  scrollContainer: {
    flex: 1,
  },
  mainContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerRTL: {
    flexDirection: 'row-reverse',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  titleRTL: {
    textAlign: 'right',
  },
  languageToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  languageButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  languageButtonText: {
    fontSize: 10,
    color: '#666',
  },
  languageButtonTextActive: {
    color: '#fff',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  sectionRTL: {
    direction: 'rtl',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  sectionTitleRTL: {
    textAlign: 'left',
  },
  infoContainer: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  infoRowRTL: {
    flexDirection: 'row-reverse',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    flex: 1,
  },
  infoLabelRTL: {
    textAlign: 'right',
  },
  infoValue: {
    fontSize: 12,
    color: '#333',
    flex: 2,
    textAlign: 'right',
  },
  infoValueRTL: {
    textAlign: 'left',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    marginRight: 8,
  },
  contractTextContainer: {
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    padding: 8,
    marginTop: 8,
    maxHeight: 250,
    minHeight: 80,
  },
  contractTextContainerRTL: {
    direction: 'rtl',
  },
  contractText: {
    fontSize: 11,
    color: '#333',
    lineHeight: 16,
  },
  contractTextRTL: {
    textAlign: 'right',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  errorText: {
    fontSize: 12,
    color: '#dc3545',
  },
}); 
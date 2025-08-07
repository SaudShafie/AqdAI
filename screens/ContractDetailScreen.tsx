import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { RootStackParamList } from '../App';
import { getCurrentUserWithData } from '../auth';
import ApprovalWorkflow from '../components/ApprovalWorkflow';
import CommentsSection from '../components/CommentsSection';
import { db } from '../firebaseServices';

type Props = NativeStackScreenProps<RootStackParamList, 'ContractDetail'>;

interface ContractDetail {
  id: string;
  title: string;
  category: string;
  status: 'uploaded' | 'analyzed' | 'reviewed' | 'approved' | 'rejected';
  uploadedBy: string;
  createdAt: any;
  summary?: string;
  extractedClauses?: any[];
  fileName?: string;
  assignedTo?: string;
  approvedBy?: string;
  approvalComment?: string;
}

interface Comment {
  id: string;
  text: string;
  createdAt: any;
  createdBy: string;
}

export default function ContractDetailScreen({ navigation, route }: Props) {
  const { contractId } = route.params;
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  useEffect(() => {
    fetchContractDetails();
    fetchUserRole();
  }, []);

  useEffect(() => {
    if (contract) {
      fetchComments();
    }
  }, [contract]);

  const fetchUserRole = async () => {
    try {
      const currentUser = await getCurrentUserWithData();
      if (currentUser?.userData) {
        setUserRole(currentUser.userData.role);
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
        navigation.goBack();
      }
    } catch (error: any) {
      console.error('Failed to fetch contract details:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    if (!contract) return;
    
    try {
      const commentsRef = collection(db, 'contracts', contractId, 'comments');
      const commentsSnap = await getDocs(commentsRef);
      const commentsData = commentsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];
      setComments(commentsData);
    } catch (error) {
      console.error('Failed to fetch comments:', error);
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

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Loading Overlay for Language Switching */}
      {/* isAnalyzing, language, switchLanguage, currentAnalysis, showAnalysis are removed */}
      
      <View style={styles.mainContent}>
        <Text style={styles.title}>Contract Details</Text>
        
        {/* Basic Contract Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contract Information</Text>
          <View style={styles.infoContainer}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Title:</Text>
              <Text style={styles.infoValue}>{contract.title}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Category:</Text>
              <Text style={styles.infoValue}>{contract.category}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Uploaded:</Text>
              <Text style={styles.infoValue}>{formatDate(contract.createdAt)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status:</Text>
              <View style={styles.statusContainer}>
                <Text style={[styles.statusText, 
                  contract.status === 'analyzed' ? styles.statusAnalyzed :
                  contract.status === 'approved' ? styles.statusApproved :
                  contract.status === 'rejected' ? styles.statusRejected :
                  contract.status === 'reviewed' ? styles.statusReviewed :
                  styles.statusUploaded
                ]}>
                  {contract.status === 'analyzed' ? '✓ Analyzed' :
                   contract.status === 'approved' ? '✅ Approved' :
                   contract.status === 'rejected' ? '❌ Rejected' :
                   contract.status === 'reviewed' ? '👀 Under Review' :
                   '📄 Uploaded'}
                </Text>
                {contract.status === 'analyzed' && (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>AI Processed</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Analysis Controls */}
        <View style={styles.controlsContainer}>
          {/* Show analyze button only for authorized users */}
          {/* isAnalyzing, language, switchLanguage, currentAnalysis, showAnalysis are removed */}
          {/* The analyzeContract function and its related state/effects are removed */}
        </View>

        {/* Approval Workflow */}
        {contract && userRole === 'admin' && contract.assignedTo && (
          <ApprovalWorkflow
            contractId={contractId}
            contractStatus={contract.status}
            organizationId={contract.assignedTo}
            userRole={userRole}
            onStatusUpdate={fetchContractDetails}
          />
        )}

        {/* Comments Section */}
        {contract && (
          <CommentsSection
            contractId={contractId}
            userRole={userRole}
          />
        )}

        {/* Analysis Results */}
        {/* showAnalysis and currentAnalysis are removed */}
        {/* Risk Level, Summary, Key Clauses are removed */}
      </View>
    </ScrollView>
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
  mainContent: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  infoContainer: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    flex: 1,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    flex: 2,
    textAlign: 'right',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusUploaded: {
    color: '#007bff',
  },
  statusAnalyzed: {
    color: '#28a745',
  },
  statusApproved: {
    color: '#28a745',
  },
  statusRejected: {
    color: '#dc3545',
  },
  statusReviewed: {
    color: '#007bff',
  },
  statusBadge: {
    backgroundColor: '#17a2b8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  controlsContainer: {
    marginBottom: 20,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  analyzeButton: {
    backgroundColor: '#007bff',
  },
  viewButton: {
    backgroundColor: '#28a745',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  analysisControls: {
    gap: 15,
  },
  languageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  languageLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  languageButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  languageButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  languageButtonText: {
    fontSize: 14,
    color: '#666',
  },
  languageButtonTextActive: {
    color: '#fff',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingCard: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
  },
  loadingOverlayText: {
    marginTop: 15,
    fontSize: 16,
    color: '#333',
  },
  analysisContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  analysisContainerRTL: {
    direction: 'rtl',
  },
  analysisTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  analysisTitleRTL: {
    textAlign: 'right',
  },
  riskBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 10,
  },
  riskBadgeContainerRTL: {
    flexDirection: 'row-reverse',
  },
  riskLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  riskLabelRTL: {
    textAlign: 'right',
  },
  riskBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  riskHigh: {
    backgroundColor: '#dc3545',
  },
  riskMedium: {
    backgroundColor: '#ffc107',
  },
  riskLow: {
    backgroundColor: '#28a745',
  },
  riskBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  analysisSection: {
    marginBottom: 20,
  },
  analysisSubtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  analysisSubtitleRTL: {
    textAlign: 'right',
  },
  analysisText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  analysisTextRTL: {
    textAlign: 'right',
  },
  clauseItem: {
    marginBottom: 15,
  },
  clauseLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  clauseLabelRTL: {
    textAlign: 'right',
  },
  clauseText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  clauseTextRTL: {
    textAlign: 'right',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  errorText: {
    fontSize: 16,
    color: '#dc3545',
  },
}); 
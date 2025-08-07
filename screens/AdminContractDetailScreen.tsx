import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { RootStackParamList } from '../App';
import { getCurrentUserWithData } from '../auth';
import CommentsSection from '../components/CommentsSection';
import { assignContract, db, getUsersByRole, incrementAnalysisCount, UserWithId } from '../firebaseServices';
import { analyzeContractText } from '../openaiServices';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminContractDetail'>;

interface Comment {
  id: string;
  text: string;
  createdAt: any;
  createdBy: string;
  createdByName?: string;
  isAdmin?: boolean;
  contractId?: string;
}

interface ContractDetail {
  id: string;
  title: string;
  category: string;
  status: 'uploaded' | 'analyzed' | 'assigned' | 'reviewed' | 'approved' | 'rejected';
  uploadedBy: string;
  uploadedByName?: string;
  createdAt: any;
  summary?: string;
  extractedClauses?: any;
  fileName?: string;
  assignedTo?: string;
  assignedToName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvalComment?: string;
  riskLevel?: string;
  analysis?: any;
  organizationId?: string;
  assignedAt?: any;
}

interface MultilingualAnalysis {
  en: {
    summary: string;
    risk_level: string;
    extracted_clauses: {
      deadlines?: string;
      responsibilities?: string;
      payment_terms?: string;
      penalties?: string;
      confidentiality?: string;
      termination_conditions?: string;
    };
  };
  ar: {
    summary: string;
    risk_level: string;
    extracted_clauses: {
      deadlines?: string;
      responsibilities?: string;
      payment_terms?: string;
      penalties?: string;
      confidentiality?: string;
      termination_conditions?: string;
    };
  };
}

export default function AdminContractDetailScreen({ navigation, route }: Props) {
  const contractId = route.params?.contractId || '';
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showContractText, setShowContractText] = useState(false);
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [multilingualAnalysis, setMultilingualAnalysis] = useState<MultilingualAnalysis | null>(null);
  const [approvalModal, setApprovalModal] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [approving, setApproving] = useState(false);
  
  // Assignment state
  const [assignmentModal, setAssignmentModal] = useState(false);
  const [legalAssistants, setLegalAssistants] = useState<UserWithId[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [loadingAssistants, setLoadingAssistants] = useState(false);

  useEffect(() => {
    fetchContractDetails();
  }, []);

  useEffect(() => {
    if (contract) {
      fetchComments();
      // Load existing analysis if available
      if (contract.extractedClauses) {
        setMultilingualAnalysis(contract.extractedClauses as MultilingualAnalysis);
        setShowAnalysis(true);
      }
    }
  }, [contract]);

  const fetchContractDetails = async () => {
    try {
      const contractRef = doc(db, 'contracts', contractId);
      const contractSnap = await getDoc(contractRef);
      
      if (contractSnap.exists()) {
        const contractData = contractSnap.data() as ContractDetail;
        
        // Fetch uploader name if not already present
        if (contractData.uploadedBy && !contractData.uploadedByName) {
          try {
            const userRef = doc(db, 'users', contractData.uploadedBy);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const userData = userSnap.data();
              contractData.uploadedByName = userData.fullName || userData.email || 'Unknown User';
            }
          } catch (error) {
            console.error('Error fetching uploader name:', error);
            contractData.uploadedByName = 'Unknown User';
          }
        }

        // Fetch assigned legal assistant name if assigned
        if (contractData.assignedTo && !contractData.assignedToName) {
          try {
            const assistantRef = doc(db, 'users', contractData.assignedTo);
            const assistantSnap = await getDoc(assistantRef);
            if (assistantSnap.exists()) {
              const assistantData = assistantSnap.data();
              contractData.assignedToName = assistantData.fullName || assistantData.email || 'Unknown Assistant';
            }
          } catch (error) {
            console.error('Error fetching assigned assistant name:', error);
            contractData.assignedToName = 'Unknown Assistant';
          }
        }

        // Fetch approver name if approved/rejected
        if (contractData.approvedBy && !contractData.approvedByName) {
          try {
            const approverRef = doc(db, 'users', contractData.approvedBy);
            const approverSnap = await getDoc(approverRef);
            if (approverSnap.exists()) {
              const approverData = approverSnap.data();
              contractData.approvedByName = approverData.fullName || approverData.email || 'Unknown Approver';
            }
          } catch (error) {
            console.error('Error fetching approver name:', error);
            contractData.approvedByName = 'Unknown Approver';
          }
        }
        
        setContract({ ...contractData, id: contractId });
      } else {
        Alert.alert('Error', 'Contract not found');
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
      const commentsRef = collection(db, 'comments');
      const commentsQuery = getDocs(commentsRef);
      const commentsSnapshot = await commentsQuery;
      
      const commentsData: Comment[] = commentsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Comment))
        .filter(comment => comment.contractId === contract.id)
        .sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
      
      setComments(commentsData);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const analyzeContract = async () => {
    if (!contract?.summary) {
      Alert.alert('Analysis Failed', 'No contract text found for analysis.');
      return;
    }

    try {
      setIsAnalyzing(true);
      
      // Analyze both languages and let AI determine the risk level
      const [enAnalysis, arAnalysis] = await Promise.all([
        analyzeContractText(contract.summary, 'en'),
        analyzeContractText(contract.summary, 'ar')
      ]);
      
      // Let AI determine the final risk level based on both analyses
      const enRisk = enAnalysis.risk_level;
      const arRisk = arAnalysis.risk_level as string;
      
      // Map Arabic risk levels to English for comparison
      const arRiskEnglish = arRisk === 'عالي' ? 'High' : 
                           arRisk === 'متوسط' ? 'Medium' : 'Low';
      
      // Determine final risk level based on both analyses
      let finalRiskLevel: 'Low' | 'Medium' | 'High';
      if (enRisk === 'High' || arRiskEnglish === 'High') {
        finalRiskLevel = 'High';
      } else if (enRisk === 'Medium' || arRiskEnglish === 'Medium') {
        finalRiskLevel = 'Medium';
      } else {
        finalRiskLevel = 'Low';
      }
      
      // Create analysis result with consistent risk level
      const analysisResult = {
        en: {
          ...enAnalysis,
          risk_level: finalRiskLevel
        },
        ar: {
          ...arAnalysis,
          risk_level: finalRiskLevel === 'High' ? 'عالي' : 
                     finalRiskLevel === 'Medium' ? 'متوسط' : 'منخفض'
        }
      } as unknown as MultilingualAnalysis;
      
      setMultilingualAnalysis(analysisResult);
      setShowAnalysis(true);
      
      // Update contract status to analyzed
      const contractRef = doc(db, 'contracts', contractId);
      await updateDoc(contractRef, {
        status: 'analyzed',
        extractedClauses: analysisResult,
        riskLevel: analysisResult.en.risk_level // Store risk level in separate field for easy access
      });
      
      // Update local contract state immediately
      setContract(prev => prev ? {
        ...prev,
        status: 'analyzed',
        extractedClauses: analysisResult,
        riskLevel: analysisResult.en.risk_level
      } : null);
      
      // Increment analysis counter for admin/legal assistant users
      try {
        const currentUser = await getCurrentUserWithData();
        if (currentUser?.userData?.organizationId) {
          await incrementAnalysisCount(currentUser.userData.organizationId);
        }
      } catch (error) {
        console.error('Failed to increment analysis counter:', error);
        // Don't fail the analysis if counter update fails
      }
      
      Alert.alert('Analysis Complete', 'Contract has been analyzed successfully in both languages!');
    } catch (error: any) {
      Alert.alert('Analysis Failed', 'Unable to analyze contract. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const switchLanguage = async (newLanguage: 'en' | 'ar') => {
    try {
      // Check if we have analysis for the new language
      if (multilingualAnalysis && multilingualAnalysis[newLanguage]) {
        setLanguage(newLanguage);
        return;
      }
      
      // If no analysis exists for this language, analyze it
      if (contract?.summary) {
        setLanguage(newLanguage);
        setIsAnalyzing(true);
        
        const analysis = await analyzeContractText(contract.summary, newLanguage);
        
        // Get existing risk level for consistency
        const existingRiskLevel = multilingualAnalysis?.[language]?.risk_level || analysis.risk_level;
        
        // Map risk levels for consistency
        const consistentRiskLevel = (existingRiskLevel as string) === 'عالي' ? 'High' : 
                                  (existingRiskLevel as string) === 'متوسط' ? 'Medium' : 
                                  (existingRiskLevel as string) === 'منخفض' ? 'Low' : existingRiskLevel;
        
        // Determine final risk level based on both analyses
        let finalRiskLevel: 'Low' | 'Medium' | 'High';
        if (consistentRiskLevel === 'High' || analysis.risk_level === 'High' || 
            (analysis.risk_level as string) === 'عالي') {
          finalRiskLevel = 'High';
        } else if (consistentRiskLevel === 'Medium' || analysis.risk_level === 'Medium' || 
                   (analysis.risk_level as string) === 'متوسط') {
          finalRiskLevel = 'Medium';
        } else {
          finalRiskLevel = 'Low';
        }
        
        // Update analysis with consistent risk level
        const updatedAnalysis = {
          ...multilingualAnalysis,
          [newLanguage]: {
            ...analysis,
            risk_level: newLanguage === 'ar' ? 
              (finalRiskLevel === 'High' ? 'عالي' : finalRiskLevel === 'Medium' ? 'متوسط' : 'منخفض') :
              finalRiskLevel
          }
        } as MultilingualAnalysis;
        
        setMultilingualAnalysis(updatedAnalysis);
        
        // Update contract with new analysis
        const contractRef = doc(db, 'contracts', contractId);
        await updateDoc(contractRef, {
          extractedClauses: updatedAnalysis,
          riskLevel: updatedAnalysis.en.risk_level // Update risk level field
        });
        
        Alert.alert('Analysis Complete', `Contract has been analyzed in ${newLanguage === 'en' ? 'English' : 'Arabic'}!`);
      } else {
        setLanguage(newLanguage);
        Alert.alert('Analysis Required', 'Please click "Analyze Contract" first to analyze in this language.');
      }
    } catch (error: any) {
      Alert.alert('Language Switch Failed', 'Unable to switch language. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApproveContract = async () => {
    if (!contract) return;
    
    try {
      setApproving(true);
      const currentUser = await getCurrentUserWithData();
      
      await updateDoc(doc(db, 'contracts', contract.id), {
        status: 'approved',
        approvedBy: currentUser?.uid,
        approvalComment: approvalComment.trim() || 'Approved by admin',
        approvedAt: new Date()
      });
      
      setContract(prev => prev ? {
        ...prev,
        status: 'approved',
        approvedBy: currentUser?.uid,
        approvalComment: approvalComment.trim() || 'Approved by admin'
      } : null);
      
      setApprovalModal(false);
      setApprovalComment('');
      Alert.alert('Success', 'Contract approved successfully');
    } catch (error) {
      console.error('Approval error:', error);
      Alert.alert('Approval Failed', 'Unable to approve contract. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectContract = async () => {
    if (!contract) return;
    
    try {
      setApproving(true);
      const currentUser = await getCurrentUserWithData();
      
      await updateDoc(doc(db, 'contracts', contract.id), {
        status: 'rejected',
        approvedBy: currentUser?.uid,
        approvalComment: approvalComment.trim() || 'Rejected by admin',
        approvedAt: new Date()
      });
      
      setContract(prev => prev ? {
        ...prev,
        status: 'rejected',
        approvedBy: currentUser?.uid,
        approvalComment: approvalComment.trim() || 'Rejected by admin'
      } : null);
      
      setApprovalModal(false);
      setApprovalComment('');
      Alert.alert('Success', 'Contract rejected');
    } catch (error) {
      console.error('Rejection error:', error);
      Alert.alert('Rejection Failed', 'Unable to reject contract. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return language === 'ar' ? 'تمت الموافقة' : 'Approved';
      case 'analyzed': return language === 'ar' ? 'تم التحليل' : 'Analyzed';
      case 'uploaded': return language === 'ar' ? 'في الانتظار' : 'Pending';
      case 'reviewed': return language === 'ar' ? 'تم المراجعة' : 'Reviewed';
      case 'rejected': return language === 'ar' ? 'مرفوض' : 'Rejected';
      case 'assigned': return language === 'ar' ? 'تم التعيين' : 'Assigned';
      default: return language === 'ar' ? 'غير معروف' : 'Unknown';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#28a745';
      case 'analyzed': return '#17a2b8';
      case 'uploaded': return '#ffc107';
      case 'reviewed': return '#6f42c1';
      case 'rejected': return '#dc3545';
      case 'assigned': return '#fd7e14';
      default: return '#6c757d';
    }
  };

  const loadLegalAssistants = async () => {
    if (!contract?.organizationId) {
      Alert.alert('Error', 'No organization found for this contract');
      return;
    }

    try {
      setLoadingAssistants(true);
      const assistants = await getUsersByRole(contract.organizationId, 'legal_assistant');
      setLegalAssistants(assistants);
    } catch (error: any) {
      console.error('Failed to load legal assistants:', error);
      Alert.alert('Error', 'Failed to load legal assistants');
    } finally {
      setLoadingAssistants(false);
    }
  };

  const handleAssignContract = async () => {
    if (!selectedAssistant) {
      Alert.alert('Missing Selection', 'Please select a legal assistant');
      return;
    }

    try {
      setAssigning(true);
      await assignContract(contractId, selectedAssistant);
      
      // Get the selected assistant's name
      const selectedAssistantData = legalAssistants.find(assistant => assistant.id === selectedAssistant);
      const assistantName = selectedAssistantData?.fullName || selectedAssistantData?.email || 'Unknown Assistant';
      
      // Update local contract state
      setContract(prev => prev ? {
        ...prev,
        assignedTo: selectedAssistant,
        assignedToName: assistantName,
        status: 'assigned',
        assignedAt: new Date() as any
      } : null);
      
      setAssignmentModal(false);
      setSelectedAssistant('');
      
    } catch (error: any) {
      console.error('Assignment error:', error);
      Alert.alert('Assignment Failed', 'Unable to assign contract. Please try again.');
    } finally {
      setAssigning(false);
    }
  };

  const openAssignmentModal = async () => {
    await loadLegalAssistants();
    setAssignmentModal(true);
  };

  const currentAnalysis = multilingualAnalysis?.[language];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>
          {language === 'ar' ? 'جاري تحميل العقد...' : 'Loading contract...'}
        </Text>
      </View>
    );
  }

  if (!contract) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          {language === 'ar' ? 'العقد غير موجود' : 'Contract not found'}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Loading Overlay for Language Switching */}
      {isAnalyzing && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#007bff" />
            <Text style={styles.loadingOverlayText}>
              {language === 'ar' ? 'جاري التحليل...' : 'Analyzing...'}
            </Text>
          </View>
        </View>
      )}
      
      {/* Header */}
      <View style={[styles.header, language === 'ar' && { flexDirection: 'row-reverse' }]}>
        <Text style={[styles.title, language === 'ar' && { textAlign: 'right' }]}>
          {language === 'ar' ? 'تفاصيل العقد' : 'Contract Details'}
        </Text>
        <View style={styles.languageToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, language === 'en' && styles.toggleButtonActive]}
            onPress={() => switchLanguage('en')}
          >
            <Text style={[styles.toggleButtonText, language === 'en' && styles.toggleButtonTextActive]}>
              English
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, language === 'ar' && styles.toggleButtonActive]}
            onPress={() => switchLanguage('ar')}
          >
            <Text style={[styles.toggleButtonText, language === 'ar' && styles.toggleButtonTextActive]}>
              العربية
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Contract Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, language === 'ar' && { textAlign: 'right' }]}>
            {language === 'ar' ? 'معلومات العقد' : 'Contract Information'}
          </Text>
          <View style={styles.infoCard}>
            <Text style={[styles.contractTitle, language === 'ar' && { textAlign: 'right' }]}>{contract.title}</Text>
            <View style={[styles.infoRow, language === 'ar' && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.infoLabel, language === 'ar' && { textAlign: 'right' }]}>
                {language === 'ar' ? 'الفئة:' : 'Category:'}
              </Text>
              <Text style={[styles.infoValue, language === 'ar' && { textAlign: 'right' }]}>{contract.category || (language === 'ar' ? 'غير مصنف' : 'Uncategorized')}</Text>
            </View>
            <View style={[styles.infoRow, language === 'ar' && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.infoLabel, language === 'ar' && { textAlign: 'right' }]}>
                {language === 'ar' ? 'الحالة:' : 'Status:'}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(contract.status) }]}>
                <Text style={styles.statusText}>{getStatusText(contract.status)}</Text>
              </View>
            </View>
            <View style={[styles.infoRow, language === 'ar' && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.infoLabel, language === 'ar' && { textAlign: 'right' }]}>
                {language === 'ar' ? 'تم الرفع:' : 'Uploaded:'}
              </Text>
              <Text style={[styles.infoValue, language === 'ar' && { textAlign: 'right' }]}>
                {contract.createdAt?.toDate?.()?.toLocaleDateString() || (language === 'ar' ? 'غير معروف' : 'Unknown')}
              </Text>
            </View>
            <View style={[styles.infoRow, language === 'ar' && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.infoLabel, language === 'ar' && { textAlign: 'right' }]}>
                {language === 'ar' ? 'بواسطة:' : 'By:'}
              </Text>
              <Text style={[styles.infoValue, language === 'ar' && { textAlign: 'right' }]}>
                {contract.uploadedByName || contract.uploadedBy || (language === 'ar' ? 'مستخدم غير معروف' : 'Unknown User')}
              </Text>
            </View>
            {contract.assignedTo && (
              <View style={[styles.infoRow, language === 'ar' && { flexDirection: 'row-reverse' }]}>
                <Text style={[styles.infoLabel, language === 'ar' && { textAlign: 'right' }]}>
                  {language === 'ar' ? 'معين إلى:' : 'Assigned to:'}
                </Text>
                <Text style={[styles.infoValue, language === 'ar' && { textAlign: 'right' }]}>
                  {contract.assignedToName || contract.assignedTo}
                </Text>
              </View>
            )}
            {contract.approvedBy && (
              <View style={[styles.infoRow, language === 'ar' && { flexDirection: 'row-reverse' }]}>
                <Text style={[styles.infoLabel, language === 'ar' && { textAlign: 'right' }]}>
                  {contract.status === 'approved' ? (language === 'ar' ? 'تمت الموافقة بواسطة:' : 'Approved by:') : 
                   contract.status === 'rejected' ? (language === 'ar' ? 'تم الرفض بواسطة:' : 'Rejected by:') : 
                   (language === 'ar' ? 'تم التحديث بواسطة:' : 'Updated by:')}
                </Text>
                <Text style={[styles.infoValue, language === 'ar' && { textAlign: 'right' }]}>
                  {contract.approvedByName || contract.approvedBy}
                </Text>
              </View>
            )}
            {currentAnalysis && (
              <View style={[styles.infoRow, language === 'ar' && { flexDirection: 'row-reverse' }]}>
                <Text style={[styles.infoLabel, language === 'ar' && { textAlign: 'right' }]}>
                  {language === 'ar' ? 'مستوى المخاطر:' : 'Risk Level:'}
                </Text>
                <Text style={[styles.riskLevel, { 
                  color: (multilingualAnalysis?.en?.risk_level === 'High' || (multilingualAnalysis?.ar?.risk_level as string) === 'عالي') ? '#dc3545' :
                         (multilingualAnalysis?.en?.risk_level === 'Medium' || (multilingualAnalysis?.ar?.risk_level as string) === 'متوسط') ? '#ffc107' : '#28a745'
                }, language === 'ar' && { textAlign: 'right' }]}>
                  {(multilingualAnalysis?.en?.risk_level === 'High' || (multilingualAnalysis?.ar?.risk_level as string) === 'عالي') ? 
                    (language === 'ar' ? 'عالي' : 'High') :
                   (multilingualAnalysis?.en?.risk_level === 'Medium' || (multilingualAnalysis?.ar?.risk_level as string) === 'متوسط') ? 
                    (language === 'ar' ? 'متوسط' : 'Medium') : 
                    (language === 'ar' ? 'منخفض' : 'Low')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, language === 'ar' && { textAlign: 'right' }]}>
            {language === 'ar' ? 'الإجراءات' : 'Actions'}
          </Text>
          <View style={styles.actionButtons}>
            {contract.status === 'uploaded' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.analyzeButton]}
                onPress={analyzeContract}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <View style={styles.loadingButton}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.buttonText}>
                      {language === 'ar' ? 'جاري التحليل...' : 'Analyzing...'}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>
                    {language === 'ar' ? '🤖 تحليل العقد' : '🤖 Analyze Contract'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            
            {(contract.status === 'analyzed' || contract.status === 'assigned') && (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={() => setApprovalModal(true)}
                >
                  <Text style={styles.actionButtonText}>
                    {language === 'ar' ? 'موافقة' : 'Approve'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={() => setApprovalModal(true)}
                >
                  <Text style={styles.actionButtonText}>
                    {language === 'ar' ? 'رفض' : 'Reject'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            
            {(contract.status === 'uploaded' || contract.status === 'analyzed') && !contract.assignedTo && (
              <TouchableOpacity
                style={[styles.actionButton, styles.assignButton]}
                onPress={openAssignmentModal}
              >
                <Text style={styles.actionButtonText}>
                  {language === 'ar' ? 'تعيين' : 'Assign'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Single Toggle Button - Above Analysis Section */}
        {(contract.status === 'analyzed' || showAnalysis || showContractText) && (
          <View style={styles.section}>
            <TouchableOpacity 
              style={[styles.singleToggleButton, showContractText && styles.singleToggleButtonActive]} 
              onPress={() => {
                if (showAnalysis) {
                  setShowAnalysis(false);
                  setShowContractText(true);
                } else {
                  setShowContractText(false);
                  setShowAnalysis(true);
                }
              }}
            >
              <Text style={[styles.singleToggleButtonText, showContractText && styles.singleToggleButtonTextActive]}>
                {showContractText ? 
                  (language === 'ar' ? 'عرض التحليل' : 'Show Analysis') :
                  (language === 'ar' ? 'عرض النص' : 'Show Text')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Analysis Results */}
        {showAnalysis && (currentAnalysis || (contract?.status === 'analyzed' && contract.extractedClauses)) && (
          <View style={styles.analysisContainer}>
            <View style={[styles.analysisHeader, language === 'ar' && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.analysisTitle, language === 'ar' && { textAlign: 'right' }]}>
                {language === 'ar' ? 'نتائج التحليل الذكي' : 'AI Analysis Results'}
              </Text>
            </View>
            
            <ScrollView 
              style={styles.analysisCard} 
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={false}
            >
              {/* Risk Level */}
              <View style={styles.analysisSection}>
                <Text style={[styles.analysisSubtitle, language === 'ar' && { textAlign: 'right' }]}>
                  {language === 'ar' ? 'مستوى المخاطر:' : 'Risk Level:'}
                </Text>
                <View style={[styles.riskBadge, 
                  (multilingualAnalysis?.en?.risk_level === 'High' || (multilingualAnalysis?.ar?.risk_level as string) === 'عالي') ? styles.riskHigh :
                  (multilingualAnalysis?.en?.risk_level === 'Medium' || (multilingualAnalysis?.ar?.risk_level as string) === 'متوسط') ? styles.riskMedium : styles.riskLow
                ]}>
                  <Text style={styles.riskBadgeText}>
                    {/* Display risk level in current language */}
                    {(multilingualAnalysis?.en?.risk_level === 'High' || (multilingualAnalysis?.ar?.risk_level as string) === 'عالي') ? 
                      (language === 'ar' ? 'عالي' : 'High') :
                     (multilingualAnalysis?.en?.risk_level === 'Medium' || (multilingualAnalysis?.ar?.risk_level as string) === 'متوسط') ? 
                      (language === 'ar' ? 'متوسط' : 'Medium') : 
                      (language === 'ar' ? 'منخفض' : 'Low')}
                  </Text>
                </View>
              </View>

              {/* Summary */}
              <View style={styles.analysisSection}>
                <Text style={[styles.analysisSubtitle, language === 'ar' && { textAlign: 'right' }]}>
                  {language === 'ar' ? 'الملخص:' : 'Summary:'}
                </Text>
                <Text style={[styles.analysisText, language === 'ar' && styles.rtlText]}>
                  {currentAnalysis?.summary || 'No summary available'}
                </Text>
              </View>

              {/* Extracted Clauses */}
              <View style={styles.analysisSection}>
                <Text style={[styles.analysisSubtitle, language === 'ar' && { textAlign: 'right' }]}>
                  {language === 'ar' ? 'البنود الرئيسية:' : 'Key Clauses:'}
                </Text>
                
                {currentAnalysis?.extracted_clauses?.deadlines && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && { textAlign: 'right' }]}>
                      {language === 'ar' ? 'المواعيد النهائية:' : 'Deadlines:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.rtlText]}>
                      {currentAnalysis.extracted_clauses.deadlines}
                    </Text>
                  </View>
                )}
                
                {currentAnalysis?.extracted_clauses?.responsibilities && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && { textAlign: 'right' }]}>
                      {language === 'ar' ? 'المسؤوليات:' : 'Responsibilities:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.rtlText]}>
                      {currentAnalysis.extracted_clauses.responsibilities}
                    </Text>
                  </View>
                )}
                
                {currentAnalysis?.extracted_clauses?.payment_terms && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && { textAlign: 'right' }]}>
                      {language === 'ar' ? 'شروط الدفع:' : 'Payment Terms:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.rtlText]}>
                      {currentAnalysis.extracted_clauses.payment_terms}
                    </Text>
                  </View>
                )}
                
                {currentAnalysis?.extracted_clauses?.penalties && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && { textAlign: 'right' }]}>
                      {language === 'ar' ? 'العقوبات:' : 'Penalties:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.rtlText]}>
                      {currentAnalysis.extracted_clauses.penalties}
                    </Text>
                  </View>
                )}
                
                {currentAnalysis?.extracted_clauses?.confidentiality && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && { textAlign: 'right' }]}>
                      {language === 'ar' ? 'السرية:' : 'Confidentiality:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.rtlText]}>
                      {currentAnalysis.extracted_clauses.confidentiality}
                    </Text>
                  </View>
                )}
                
                {currentAnalysis?.extracted_clauses?.termination_conditions && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && { textAlign: 'right' }]}>
                      {language === 'ar' ? 'شروط الإنهاء:' : 'Termination Conditions:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.rtlText]}>
                      {currentAnalysis.extracted_clauses.termination_conditions}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Contract Text */}
        {showContractText && contract?.summary && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, language === 'ar' && { textAlign: 'right' }]}>
              {language === 'ar' ? 'نص العقد' : 'Contract Text'}
            </Text>
            
            <ScrollView 
              style={styles.contractTextContainer}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <Text style={[styles.contractText, language === 'ar' && styles.rtlText]}>
                {contract.summary}
              </Text>
            </ScrollView>
          </View>
        )}

        {/* Comments */}
        <View style={styles.section}>
          <CommentsSection
            contractId={contract.id}
            language={language}
            userRole="admin"
          />
        </View>
      </ScrollView>

      {/* Approval Modal */}
      <Modal
        visible={approvalModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, language === 'ar' && { textAlign: 'right' }]}>
              {language === 'ar' ? 'موافقة على العقد' : 'Contract Approval'}
            </Text>
            <TextInput
              style={[styles.modalInput, language === 'ar' && { textAlign: 'right' }]}
              placeholder={language === 'ar' ? 'إضافة تعليق الموافقة (اختياري)...' : 'Add approval comment (optional)...'}
              placeholderTextColor="#adb5bd"
              value={approvalComment}
              onChangeText={setApprovalComment}
              multiline
              numberOfLines={3}
            />
            <View style={[styles.modalButtons, language === 'ar' && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setApprovalModal(false)}
              >
                <Text style={styles.cancelButtonText}>
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.approveButton]}
                onPress={handleApproveContract}
                disabled={approving}
              >
                <Text style={styles.actionButtonText}>
                  {approving ? (language === 'ar' ? 'جاري الموافقة...' : 'Approving...') : (language === 'ar' ? 'موافقة' : 'Approve')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.rejectButton]}
                onPress={handleRejectContract}
                disabled={approving}
              >
                <Text style={styles.actionButtonText}>
                  {approving ? (language === 'ar' ? 'جاري الرفض...' : 'Rejecting...') : (language === 'ar' ? 'رفض' : 'Reject')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assignment Modal */}
      <Modal
        visible={assignmentModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, language === 'ar' && { textAlign: 'right' }]}>
              {language === 'ar' ? 'تعيين العقد' : 'Assign Contract'}
            </Text>
            
            {loadingAssistants ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#007bff" />
                <Text style={styles.loadingText}>
                  {language === 'ar' ? 'جاري تحميل المساعدين القانونيين...' : 'Loading legal assistants...'}
                </Text>
              </View>
            ) : legalAssistants.length === 0 ? (
              <Text style={[styles.modalText, language === 'ar' && { textAlign: 'right' }]}>
                {language === 'ar' ? 'لا يوجد مساعدين قانونيين في هذه المنظمة' : 'No legal assistants found in this organization'}
              </Text>
            ) : (
              <>
                <Text style={[styles.modalSubtitle, language === 'ar' && { textAlign: 'right' }]}>
                  {language === 'ar' ? 'اختر مساعد قانوني:' : 'Select a legal assistant:'}
                </Text>
                <ScrollView style={styles.assistantsList} showsVerticalScrollIndicator={false}>
                  {legalAssistants.map((assistant) => (
                    <TouchableOpacity
                      key={assistant.id}
                      style={[
                        styles.assistantItem,
                        selectedAssistant === assistant.id && styles.assistantItemSelected,
                        language === 'ar' && { flexDirection: 'row-reverse' }
                      ]}
                      onPress={() => setSelectedAssistant(assistant.id)}
                    >
                      <Text style={[
                        styles.assistantName,
                        selectedAssistant === assistant.id && styles.assistantNameSelected,
                        language === 'ar' && { textAlign: 'right' }
                      ]}>
                        {assistant.fullName}
                      </Text>
                      <Text style={[
                        styles.assistantEmail,
                        selectedAssistant === assistant.id && styles.assistantEmailSelected,
                        language === 'ar' && { textAlign: 'right' }
                      ]}>
                        {assistant.email}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            
            <View style={[styles.modalButtons, language === 'ar' && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setAssignmentModal(false);
                  setSelectedAssistant('');
                }}
              >
                <Text style={styles.cancelButtonText}>
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.assignButton]}
                onPress={handleAssignContract}
                disabled={assigning || !selectedAssistant || legalAssistants.length === 0}
              >
                <Text style={styles.actionButtonText}>
                  {assigning ? (language === 'ar' ? 'جاري التعيين...' : 'Assigning...') : (language === 'ar' ? 'تعيين' : 'Assign')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    fontSize: 14,
    color: '#6c757d',
    marginTop: 10,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  content: {
    flex: 1,
    padding: 15,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f8f9fa',
  },
  contractTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 11,
    color: '#6c757d',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 11,
    color: '#2c3e50',
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
  riskLevel: {
    fontSize: 11,
    fontWeight: '600',
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
  analyzeButton: {
    backgroundColor: '#007bff',
  },
  approveButton: {
    backgroundColor: '#28a745',
  },
  rejectButton: {
    backgroundColor: '#dc3545',
  },
  assignButton: {
    backgroundColor: '#fd7e14',
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  analysisContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f8f9fa',
    marginTop: 10,
  },
  analysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  analysisTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  languageToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  toggleButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  toggleButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  toggleButtonText: {
    fontSize: 10,
    color: '#6c757d',
    fontWeight: '500',
  },
  toggleButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  analysisCard: {
    maxHeight: 300,
  },
  analysisSection: {
    marginBottom: 15,
  },
  analysisSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  analysisText: {
    fontSize: 11,
    color: '#2c3e50',
    lineHeight: 16,
    textAlign: 'left',
  },
  rtlText: {
    textAlign: 'right',
    direction: 'ltr',
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  riskBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
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
  clauseItem: {
    marginBottom: 10,
  },
  clauseLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6c757d',
    marginBottom: 4,
  },
  clauseText: {
    fontSize: 11,
    color: '#2c3e50',
    lineHeight: 16,
  },
  contractTextContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
    maxHeight: 200,
  },
  contractText: {
    fontSize: 11,
    color: '#2c3e50',
    lineHeight: 16,
  },
  toggleButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1,
  },
  loadingCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  loadingOverlayText: {
    marginTop: 10,
    fontSize: 14,
    color: '#6c757d',
  },
  loadingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  buttonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 20,
    width: '90%',
    borderWidth: 1,
    borderColor: '#f8f9fa',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    color: '#2c3e50',
    marginBottom: 15,
    minHeight: 60,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  cancelButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  singleToggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  singleToggleButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  singleToggleButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6c757d',
  },
  singleToggleButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  modalText: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 15,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  assistantsList: {
    maxHeight: 200,
    marginBottom: 15,
  },
  assistantItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#f8f9fa',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  assistantItemSelected: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  assistantName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 2,
  },
  assistantNameSelected: {
    color: '#fff',
  },
  assistantEmail: {
    fontSize: 10,
    color: '#6c757d',
  },
  assistantEmailSelected: {
    color: '#fff',
  },
}); 
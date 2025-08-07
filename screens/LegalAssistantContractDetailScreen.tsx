// screens/LegalAssistantContractDetailScreen.tsx
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
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
import { getCurrentUserWithData } from '../auth';
import CommentsSection from '../components/CommentsSection';
import { getDocument, updateContractStatus, type Contract } from '../firebaseServices';

interface LegalAssistantContractDetailScreenProps {
  navigation: any;
  route: any;
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

export default function LegalAssistantContractDetailScreen({ navigation, route }: LegalAssistantContractDetailScreenProps) {
  const { contractId } = route.params;
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showContractText, setShowContractText] = useState(false);
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [multilingualAnalysis, setMultilingualAnalysis] = useState<MultilingualAnalysis | null>(null);
  const [approvalModal, setApprovalModal] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [approving, setApproving] = useState(false);

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchContractDetails();
    }, [contractId])
  );

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      const contractData = await getDocument('contracts', contractId);
      const typedContractData = contractData as unknown as Contract;
      
      // Fetch uploader name if we have uploader ID
      if (typedContractData?.uploadedBy) {
        try {
          const { getDocument } = await import('../firebaseServices');
          const userData = await getDocument('users', typedContractData.uploadedBy) as any;
          if (userData) {
            (typedContractData as any).uploadedByName = userData.fullName || userData.email || typedContractData.uploadedBy;
          }
        } catch (error) {
          console.error('Error fetching uploader name:', error);
          (typedContractData as any).uploadedByName = typedContractData.uploadedBy;
        }
      }
      
      setContract(typedContractData);
      
      // Show analysis if contract is analyzed
      if (typedContractData?.status === 'analyzed' && typedContractData?.extractedClauses) {
        setShowAnalysis(true);
        setMultilingualAnalysis(typedContractData.extractedClauses as unknown as MultilingualAnalysis);
      }
    } catch (error: any) {
      console.error('Error loading contract:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    try {
      setApproving(true);
      
      const currentUser = await getCurrentUserWithData();
      if (!currentUser?.uid) {
        Alert.alert('Access Denied', 'Please log in to perform this action');
        return;
      }

      // Check if this contract is assigned to the current user
      if (contract?.assignedTo !== currentUser.uid) {
        Alert.alert('Access Denied', 'You can only update contracts assigned to you');
        return;
      }

      await updateContractStatus(contractId, newStatus, currentUser.uid);
      
      // Reload contract data
      await fetchContractDetails();
      
      setApprovalModal(false);
      setApprovalComment('');
    } catch (error: any) {
      console.error('Error updating contract status:', error);
      Alert.alert('Update Failed', 'Unable to update contract status. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  const handleAnalyzeContract = async () => {
    try {
      setIsAnalyzing(true);
      
      const currentUser = await getCurrentUserWithData();
      if (!currentUser?.uid) {
        Alert.alert('Access Denied', 'Please log in to perform this action');
        return;
      }

      // Check if this contract is assigned to the current user
      if (contract?.assignedTo !== currentUser.uid) {
        Alert.alert('Access Denied', 'You can only analyze contracts assigned to you');
        return;
      }

      // Check if contract has text content
      if (!contract?.summary) {
        Alert.alert('No Content', 'Contract has no text content to analyze');
        return;
      }

      // Import and call the analyze function with contract text
      const { analyzeContractText } = await import('../openaiServices');
      const analysis = await analyzeContractText(contract.summary, 'en');
      
      // Update contract with analysis results
      const { updateDoc, doc } = await import('firebase/firestore');
      const { db } = await import('../firebaseServices');
      const contractRef = doc(db, 'contracts', contractId);
      
      await updateDoc(contractRef, {
        status: 'analyzed',
        extractedClauses: {
          en: analysis
        },
        riskLevel: analysis.risk_level
      });
      
      // Reload contract data
      await fetchContractDetails();
      setShowAnalysis(true);
      
    } catch (error: any) {
      console.error('Error analyzing contract:', error);
      Alert.alert('Analysis Failed', 'Unable to analyze contract. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const switchLanguage = async (newLanguage: 'en' | 'ar') => {
    setLanguage(newLanguage);
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
      {/* Loading Overlay for Analysis */}
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
                 {(contract as any).uploadedByName || contract.uploadedBy || (language === 'ar' ? 'مستخدم غير معروف' : 'Unknown User')}
               </Text>
             </View>
            {contract.assignedAt && (
              <View style={[styles.infoRow, language === 'ar' && { flexDirection: 'row-reverse' }]}>
                <Text style={[styles.infoLabel, language === 'ar' && { textAlign: 'right' }]}>
                  {language === 'ar' ? 'تم التعيين:' : 'Assigned:'}
                </Text>
                <Text style={[styles.infoValue, language === 'ar' && { textAlign: 'right' }]}>
                  {contract.assignedAt?.toDate?.()?.toLocaleDateString() || (language === 'ar' ? 'غير معروف' : 'Unknown')}
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
            {contract.status === 'assigned' && contract?.summary && (
              <TouchableOpacity
                style={[styles.actionButton, styles.analyzeButton]}
                onPress={handleAnalyzeContract}
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
            
            {contract.status === 'analyzed' && (
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
            
            {contract.status === 'assigned' && !contract?.summary && (
              <Text style={styles.noTextMessage}>
                {language === 'ar' ? 'لا يمكن تحليل العقد - لا يوجد نص للعقد' : 'Cannot analyze contract - no contract text available'}
              </Text>
            )}
          </View>
        </View>

        {/* Single Toggle Button - Above Analysis Section */}
        {(contract.status === 'analyzed' || contract?.summary) && (
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
            contractId={contractId}
            language={language}
            userRole="legal_assistant"
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
              {language === 'ar' ? 'مراجعة العقد' : 'Contract Review'}
            </Text>
            <TextInput
              style={[styles.modalInput, language === 'ar' && { textAlign: 'right' }]}
              placeholder={language === 'ar' ? 'إضافة تعليق المراجعة (اختياري)...' : 'Add review comment (optional)...'}
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
                onPress={() => handleStatusUpdate('approved')}
                disabled={approving}
              >
                <Text style={styles.actionButtonText}>
                  {approving ? (language === 'ar' ? 'جاري الموافقة...' : 'Approving...') : (language === 'ar' ? 'موافقة' : 'Approve')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.rejectButton]}
                onPress={() => handleStatusUpdate('rejected')}
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
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  loadingOverlayText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6c757d',
    fontWeight: '500',
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
  actionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  loadingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  singleToggleButton: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
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
  },
  rtlText: {
    textAlign: 'right',
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
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
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  clauseItem: {
    marginBottom: 12,
  },
  clauseLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 4,
  },
  clauseText: {
    fontSize: 11,
    color: '#2c3e50',
    lineHeight: 16,
  },
  contractTextContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f8f9fa',
    maxHeight: 200,
  },
  contractText: {
    fontSize: 11,
    color: '#2c3e50',
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    margin: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  modalInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: '#2c3e50',
    borderWidth: 1,
    borderColor: '#e9ecef',
    minHeight: 80,
    marginBottom: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  noTextMessage: {
    fontSize: 11,
    color: '#dc3545',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
}); 
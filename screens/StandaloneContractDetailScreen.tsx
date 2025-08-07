import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
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
import { db } from '../firebaseServices';
import type { MultilingualAnalysis } from '../openaiServices';
import { analyzeContractText } from '../openaiServices';

type Props = NativeStackScreenProps<RootStackParamList, 'StandaloneContractDetail'>;

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
}

export default function StandaloneContractDetailScreen({ navigation, route }: Props) {
  const { contractId } = route.params;
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [multilingualAnalysis, setMultilingualAnalysis] = useState<MultilingualAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showContractText, setShowContractText] = useState(false);
  const [language, setLanguage] = useState<'en' | 'ar'>('en');

  useEffect(() => {
    fetchContractDetails();
  }, []);

  // Load existing analysis when contract data is available
  useEffect(() => {
    if (contract && contract.status === 'analyzed' && contract.extractedClauses) {
      if (contract.extractedClauses && 
          (contract.extractedClauses.en || contract.extractedClauses.ar)) {
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
      // For now, we'll use a simple approach: if either analysis shows High risk, use High
      // Otherwise, if either shows Medium, use Medium, else Low
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
        extractedClauses: analysisResult
      });
      
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
        
        // Merge with existing analysis and ensure consistent risk level
        const updatedAnalysis = {
          ...multilingualAnalysis,
          [newLanguage]: {
            ...analysis,
            risk_level: newLanguage === 'ar' ? 
              (finalRiskLevel === 'High' ? 'عالي' : 
               finalRiskLevel === 'Medium' ? 'متوسط' : 'منخفض') : 
              finalRiskLevel
          }
        } as unknown as MultilingualAnalysis;
        
        setMultilingualAnalysis(updatedAnalysis);
        setShowAnalysis(true);
        setIsAnalyzing(false);
        
        // Update contract with new analysis
        const contractRef = doc(db, 'contracts', contractId);
        await updateDoc(contractRef, {
          extractedClauses: updatedAnalysis
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

  const deleteContract = async () => {
    Alert.alert(
      language === 'ar' ? 'تأكيد الحذف' : 'Confirm Delete',
      language === 'ar' ? 'هل أنت متأكد من حذف هذا العقد؟ لا يمكن التراجع عن هذا الإجراء.' : 'Are you sure you want to delete this contract? This action cannot be undone.',
      [
        {
          text: language === 'ar' ? 'إلغاء' : 'Cancel',
          style: 'cancel',
        },
        {
          text: language === 'ar' ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const contractRef = doc(db, 'contracts', contractId);
              await deleteDoc(contractRef);
              Alert.alert(
                language === 'ar' ? 'تم الحذف' : 'Deleted',
                language === 'ar' ? 'تم حذف العقد بنجاح' : 'Contract has been deleted successfully',
                [
                  {
                    text: language === 'ar' ? 'حسناً' : 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]
              );
            } catch (error: any) {
              console.error('Failed to delete contract:', error);
              Alert.alert(
                language === 'ar' ? 'خطأ' : 'Error',
                language === 'ar' ? 'فشل في حذف العقد. يرجى المحاولة مرة أخرى.' : 'Failed to delete contract. Please try again.'
              );
            }
          },
        },
      ]
    );
  };

  const currentAnalysis = multilingualAnalysis?.[language];

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
    <SafeAreaView style={styles.container}>
      {/* Loading Overlay for Language Switching */}
      {isAnalyzing && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#007bff" />
            <Text style={styles.loadingOverlayText}>
              Analyzing...
            </Text>
          </View>
        </View>
      )}
      
      {/* Header */}
      <View style={[styles.header, language === 'ar' && styles.headerRTL]}>
        <Text style={[styles.title, language === 'ar' && styles.titleRTL]}>
          {language === 'ar' ? 'تفاصيل العقد' : 'Contract Details'}
        </Text>
        
        {/* Language Toggle */}
        <View style={styles.languageToggleContainer}>
          <TouchableOpacity 
            style={[styles.languageButton, language === 'en' && styles.languageButtonActive]} 
            onPress={() => switchLanguage('en')}
            disabled={isAnalyzing}
          >
            <Text style={[styles.languageButtonText, language === 'en' && styles.languageButtonTextActive]}>
              English
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.languageButton, language === 'ar' && styles.languageButtonActive]} 
            onPress={() => switchLanguage('ar')}
            disabled={isAnalyzing}
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
                  <Text style={[styles.statusText, 
                    contract.status === 'analyzed' ? styles.statusAnalyzed :
                    styles.statusUploaded
                  ]}>
                    {contract.status === 'analyzed' ? 
                      (language === 'ar' ? '✓ محلل' : '✓ Analyzed') :
                      (language === 'ar' ? '📄 مرفوع' : '📄 Uploaded')}
                  </Text>
                  {contract.status === 'analyzed' && (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>
                        {language === 'ar' ? 'معالج بالذكاء الاصطناعي' : 'AI Processed'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsContainer}>
            {/* Analyze Button */}
            {!currentAnalysis && contract?.status !== 'analyzed' ? (
              <TouchableOpacity 
                style={[styles.actionButton, styles.analyzeButton]} 
                onPress={analyzeContract}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <View style={styles.buttonLoadingContainer}>
                    <ActivityIndicator color="#fff" size="small" />
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
            ) : (
              <TouchableOpacity 
                style={[styles.actionButton, styles.analyzeButton]} 
                onPress={() => {
                  if (showAnalysis) {
                    setShowAnalysis(false);
                    setShowContractText(true);
                  } else if (showContractText) {
                    setShowContractText(false);
                    setShowAnalysis(true);
                  } else {
                    setShowAnalysis(true);
                  }
                }}
              >
                <Text style={styles.buttonText}>
                  {showAnalysis ? 
                    (language === 'ar' ? 'عرض النص' : 'Show Text') :
                    showContractText ? 
                    (language === 'ar' ? 'عرض التحليل' : 'Show Analysis') :
                    (language === 'ar' ? 'عرض التحليل' : 'Show Analysis')}
                </Text>
              </TouchableOpacity>
            )}
            

          </View>

          {/* Analysis Results */}
          {showAnalysis && (currentAnalysis || (contract?.status === 'analyzed' && contract.extractedClauses)) && (
            <View style={[styles.analysisContainer, language === 'ar' && styles.analysisContainerRTL]}>
              <Text style={[styles.analysisTitle, language === 'ar' && styles.analysisTitleRTL]}>
                {language === 'ar' ? 'نتائج التحليل الذكي' : 'AI Analysis Results'}
              </Text>
              
              {/* Risk Level */}
              <View style={[styles.riskBadgeContainer, language === 'ar' && styles.riskBadgeContainerRTL]}>
                <Text style={[styles.riskLabel, language === 'ar' && styles.riskLabelRTL]}>
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
                <Text style={[styles.analysisSubtitle, language === 'ar' && styles.analysisSubtitleRTL]}>
                  {language === 'ar' ? 'الملخص:' : 'Summary:'}
                </Text>
                <Text style={[styles.analysisText, language === 'ar' && styles.analysisTextRTL]}>
                  {currentAnalysis?.summary || 'Analysis available'}
                </Text>
              </View>

              {/* Extracted Clauses */}
              <View style={styles.analysisSection}>
                <Text style={[styles.analysisSubtitle, language === 'ar' && styles.analysisSubtitleRTL]}>
                  {language === 'ar' ? 'البنود الرئيسية:' : 'Key Clauses:'}
                </Text>
                
                {currentAnalysis?.extracted_clauses?.deadlines && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && styles.clauseLabelRTL]}>
                      {language === 'ar' ? 'المواعيد النهائية:' : 'Deadlines:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.clauseTextRTL]}>
                      {currentAnalysis.extracted_clauses.deadlines}
                    </Text>
                  </View>
                )}
                
                {currentAnalysis?.extracted_clauses?.responsibilities && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && styles.clauseLabelRTL]}>
                      {language === 'ar' ? 'المسؤوليات:' : 'Responsibilities:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.clauseTextRTL]}>
                      {currentAnalysis.extracted_clauses.responsibilities}
                    </Text>
                  </View>
                )}
                
                {currentAnalysis?.extracted_clauses?.payment_terms && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && styles.clauseLabelRTL]}>
                      {language === 'ar' ? 'شروط الدفع:' : 'Payment Terms:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.clauseTextRTL]}>
                      {currentAnalysis.extracted_clauses.payment_terms}
                    </Text>
                  </View>
                )}
                
                {currentAnalysis?.extracted_clauses?.penalties && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && styles.clauseLabelRTL]}>
                      {language === 'ar' ? 'العقوبات:' : 'Penalties:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.clauseTextRTL]}>
                      {currentAnalysis.extracted_clauses.penalties}
                    </Text>
                  </View>
                )}
                
                {currentAnalysis?.extracted_clauses?.confidentiality && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && styles.clauseLabelRTL]}>
                      {language === 'ar' ? 'السرية:' : 'Confidentiality:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.clauseTextRTL]}>
                      {currentAnalysis.extracted_clauses.confidentiality}
                    </Text>
                  </View>
                )}
                
                {currentAnalysis?.extracted_clauses?.termination_conditions && (
                  <View style={styles.clauseItem}>
                    <Text style={[styles.clauseLabel, language === 'ar' && styles.clauseLabelRTL]}>
                      {language === 'ar' ? 'شروط الإنهاء:' : 'Termination Conditions:'}
                    </Text>
                    <Text style={[styles.clauseText, language === 'ar' && styles.clauseTextRTL]}>
                      {currentAnalysis.extracted_clauses.termination_conditions}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Contract Text */}
          {showContractText && contract?.summary && (
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
        </View>
        
        {/* Delete Button at End of Content */}
        <View style={styles.deleteContainer}>
          <TouchableOpacity 
            style={styles.deleteButtonBottom} 
            onPress={deleteContract}
            disabled={isAnalyzing}
          >
            <Text style={styles.deleteButtonTextBottom}>
              {language === 'ar' ? '🗑️ حذف العقد' : '🗑️ Delete Contract'}
            </Text>
          </TouchableOpacity>
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
  deleteButton: {
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#dc3545',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  mainContent: {
    padding: 16,
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
    direction: 'ltr',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  sectionTitleRTL: {
    textAlign: 'right',
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
  actionButtonsContainer: {
    marginBottom: 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 6,
  },
  analyzeButton: {
    backgroundColor: '#007bff',
  },
  analysisButton: {
    backgroundColor: '#6c757d',
  },
  textButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  buttonLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  analysisControls: {
    gap: 12,
  },
  languageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  languageToggle: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  languageToggleText: {
    fontSize: 12,
    color: '#007bff',
    fontWeight: '600',
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
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  loadingOverlayText: {
    marginTop: 10,
    fontSize: 12,
    color: '#333',
  },
  analysisContainer: {
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
  analysisContainerRTL: {
    direction: 'rtl',
  },
  analysisTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  analysisTitleRTL: {
    textAlign: 'center',
  },
  riskBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 6,
  },
  riskBadgeContainerRTL: {
    flexDirection: 'row-reverse',
  },
  riskLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  riskLabelRTL: {
    textAlign: 'right',
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
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
    fontSize: 10,
    fontWeight: '600',
  },
  riskLevelContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  analysisSection: {
    marginBottom: 12,
  },
  analysisSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  analysisSubtitleRTL: {
    textAlign: 'left',
  },
  analysisText: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
  },
  analysisTextRTL: {
    textAlign: 'left',
  },
  clauseItem: {
    marginBottom: 10,
  },
  clauseLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    marginBottom: 3,
  },
  clauseLabelRTL: {
    textAlign: 'left',
  },
  clauseText: {
    fontSize: 11,
    color: '#666',
    lineHeight: 14,
  },
  clauseTextRTL: {
    textAlign: 'left',
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
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
  },
  statusUploaded: {
    backgroundColor: '#e0e0e0',
    color: '#333',
  },
  statusAnalyzed: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  statusBadge: {
    backgroundColor: '#007bff',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '600',
  },
  bottomContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  deleteButtonBottom: {
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#dc3545',
  },
  deleteButtonTextBottom: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
}); 
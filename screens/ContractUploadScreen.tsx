// screens/ContractUploadScreen.tsx - This screen handles contract upload and text extraction

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
    Alert,
    Animated,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { RootStackParamList } from '../App';
import { getCurrentUser, getCurrentUserWithData } from '../auth';
import { createContractDocument } from '../firebaseServices';

// OCR Space API Key - this is used for text extraction from images and PDFs
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || 'your_ocr_space_api_key_here';

type Props = NativeStackScreenProps<RootStackParamList, 'ContractUpload'>;

/**
 * Main contract upload screen component
 * Handles document scanning, text extraction, and contract creation
 * Supports multiple input methods: camera, file picker, and manual input
 */
export default function ContractUploadScreen({ navigation }: Props) {
  // Basic form state variables
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [contractText, setContractText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scannedText, setScannedText] = useState('');
  const [fileName, setFileName] = useState('');
  const [selectedInputMethod, setSelectedInputMethod] = useState<'scan' | 'manual'>('manual');
  
  // Structured contract fields - these help organize the contract data better
  const [summary, setSummary] = useState('');
  const [parties, setParties] = useState('');
  const [rules, setRules] = useState('');
  const [terms, setTerms] = useState('');
  const [conditions, setConditions] = useState('');
  const [obligations, setObligations] = useState('');
  const [penalties, setPenalties] = useState('');
  const [duration, setDuration] = useState('');
  const [payment, setPayment] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  
  // Validation states - track which fields have errors
  const [titleError, setTitleError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [textError, setTextError] = useState(false);

  // Popup states - manage UI overlays and animations
  const [showScanPopup, setShowScanPopup] = useState(false);
  const [popupAnimation] = useState(new Animated.Value(0));
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [spinnerRotation] = useState(new Animated.Value(0));

  /**
   * Extracts text from images or PDFs using OCR.space API
   * This function handles both image and PDF files
   * Returns the extracted text for further processing
   */
  const extractTextWithOCR = async (uri: string): Promise<string> => {
    try {
      const isPdf = uri.toLowerCase().includes('.pdf');
      let formData: FormData;
      
      if (isPdf) {
        // Handle PDF files - send as file upload
        formData = new FormData();
        formData.append('apikey', OCR_SPACE_API_KEY);
        formData.append('language', 'auto');
        formData.append('isOverlayRequired', 'false');
        formData.append('OCREngine', '2');
        formData.append('filetype', 'pdf');
        
        const fileInfo = {
          uri: uri,
          type: 'application/pdf',
          name: 'document.pdf'
        };
        formData.append('file', fileInfo as any);
      } else {
        // Handle image files - convert to base64 and send
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        formData = new FormData();
        formData.append('apikey', OCR_SPACE_API_KEY);
        formData.append('language', 'auto');
        formData.append('isOverlayRequired', 'false');
        formData.append('OCREngine', '2');
        formData.append('base64Image', `data:image/jpeg;base64,${base64}`);
      }

      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        throw new Error(`OCR API error: ${response.status}`);
      }

      const result = await response.json();

      if (result.IsErroredOnProcessing) {
        throw new Error(`OCR processing failed: ${result.ErrorMessage}`);
      }

      if (!result.ParsedResults || result.ParsedResults.length === 0) {
        throw new Error('No text found in the document');
      }

      const extractedText = result.ParsedResults
        .map((parsedResult: any) => parsedResult.ParsedText)
        .join('\n')
        .trim();

      return extractedText;

    } catch (error: any) {
      console.error('OCR processing failed:', error);
      throw error;
    }
  };

  /**
   * Starts the camera scanner for document capture
   * Requests camera permissions and launches camera interface
   * Processes the captured image for text extraction
   */
  const startDocumentScanner = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setProcessingStep('Camera permission is required to scan documents.');
        setTimeout(() => {
          hideScanPopup();
        }, 2000);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          const imageUri = `data:image/jpeg;base64,${asset.base64}`;
          setFileName('Captured Document');
          processDocument(imageUri, 'Captured Document');
        }
      }
    } catch (error) {
      console.error('Camera error:', error);
      setProcessingStep('Failed to capture image. Please try again.');
      setTimeout(() => {
        hideScanPopup();
      }, 2000);
    }
  };

  /**
   * Opens document picker for selecting files
   * Supports PDF and image files from device storage
   * Validates file size and processes selected documents
   */
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        if (asset.size && asset.size > 10 * 1024 * 1024) {
          setProcessingStep('File too large. Please select a smaller file (under 10MB).');
          setTimeout(() => {
            hideScanPopup();
          }, 2000);
          return;
        }

        setFileName(asset.name || 'Unknown Document');
        processDocument(asset.uri, asset.name || 'Unknown Document');
      }
    } catch (error) {
      console.error('Document picker error:', error);
      setProcessingStep('Failed to pick document. Please try again.');
      setTimeout(() => {
        hideScanPopup();
      }, 2000);
    }
  };

  /**
   * Processes the selected document for text extraction
   * Handles the entire workflow from file selection to text extraction
   * Shows progress updates and handles success/error states
   */
  const processDocument = async (uri: string, fileName: string) => {
    try {
      setIsLoading(true);
      setScannedText('');
      setIsProcessing(true);
      setShowSuccess(false);
      setProcessingStep('Extracting text...');
      
      // Reset and start spinner animation - shows processing is happening
      spinnerRotation.setValue(0);
      Animated.loop(
        Animated.timing(spinnerRotation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();

      const text = await extractTextWithOCR(uri);
      
      if (text.trim()) {
        setScannedText(text);
        setContractText(text);
        setSelectedInputMethod('scan');
        
        // Auto-generate title from first few words - helps users identify the contract
        const firstWords = text.split(' ').slice(0, 5).join(' ');
        setTitle(firstWords.length > 0 ? firstWords + '...' : '');
        
        // Show success state - let user know it worked
        setShowSuccess(true);
        setProcessingStep('Text extracted successfully!');
        
        // Stop spinner - processing is complete
        spinnerRotation.setValue(0);
        
        // Close popup after showing success - give user time to see success message
        setTimeout(() => {
          hideScanPopup();
          setIsProcessing(false);
          setShowSuccess(false);
          setIsLoading(false);
        }, 2000);
        
      } else {
        setIsLoading(false);
        setIsProcessing(false);
        setShowSuccess(false);
        setProcessingStep('No text found in the document.');
        setTimeout(() => {
          hideScanPopup();
        }, 2000);
      }
    } catch (error: any) {
      console.error('Document processing error:', error);
      setIsLoading(false);
      setIsProcessing(false);
      setShowSuccess(false);
      setProcessingStep('Processing failed. Please try again.');
      setTimeout(() => {
        hideScanPopup();
      }, 2000);
    }
  };

  /**
   * Shows the scan popup with animation
   * Opens the modal that lets users choose input method
   */
  const openScanPopup = () => {
    setShowScanPopup(true);
    setIsProcessing(false);
    setShowSuccess(false);
    setProcessingStep('');
    Animated.timing(popupAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  /**
   * Hides the scan popup with animation
   * Closes the modal and resets animation state
   */
  const hideScanPopup = () => {
    Animated.timing(popupAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowScanPopup(false);
      setIsProcessing(false);
      setShowSuccess(false);
      setProcessingStep('');
    });
  };

  // Handle camera option
  const handleCameraOption = () => {
    startDocumentScanner();
  };

  // Handle file picker option
  const handleFilePickerOption = () => {
    pickDocument();
  };

  // Manual input handler
  const handleManualInput = () => {
    setSelectedInputMethod('manual');
    setScannedText('');
    setContractText('');
    setFileName('');
    setTitle('');
    // Clear structured fields
    setSummary('');
    setParties('');
    setRules('');
    setTerms('');
    setConditions('');
    setObligations('');
    setPenalties('');
    setDuration('');
    setPayment('');
    setAdditionalNotes('');
  };

  // Upload handler
  const handleUpload = async () => {
    setTitleError(false);
    setCategoryError(false);
    setTextError(false);

    if (!title.trim()) {
      setTitleError(true);
      Alert.alert('Missing Information', 'Please enter a contract title');
      return;
    }

    if (!category.trim()) {
      setCategoryError(true);
      Alert.alert('Missing Information', 'Please select a category');
      return;
    }

    // For manual input, combine structured fields
    let finalContractText = contractText;
    if (selectedInputMethod === 'manual') {
      if (!summary.trim()) {
        Alert.alert('Missing Information', 'Please provide a summary of the contract');
        return;
      }
      
      const structuredFields = [];
      if (summary.trim()) structuredFields.push(`Summary: ${summary}`);
      if (parties.trim()) structuredFields.push(`Parties: ${parties}`);
      if (rules.trim()) structuredFields.push(`Rules: ${rules}`);
      if (terms.trim()) structuredFields.push(`Terms: ${terms}`);
      if (conditions.trim()) structuredFields.push(`Conditions: ${conditions}`);
      if (obligations.trim()) structuredFields.push(`Obligations: ${obligations}`);
      if (penalties.trim()) structuredFields.push(`Penalties: ${penalties}`);
      if (duration.trim()) structuredFields.push(`Duration: ${duration}`);
      if (payment.trim()) structuredFields.push(`Payment: ${payment}`);
      if (additionalNotes.trim()) structuredFields.push(`Additional Notes: ${additionalNotes}`);
      
      finalContractText = structuredFields.join('\n\n');
    }

    if (!finalContractText.trim()) {
      setTextError(true);
      Alert.alert('Missing Information', 'Please enter contract text or scan a document');
      return;
    }

    setIsLoading(true);
    
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Get user data to get organization ID
      const userWithData = await getCurrentUserWithData();
      if (!userWithData?.userData) {
        throw new Error('User data not found');
      }

      await createContractDocument({
        title: title.trim(),
        category: category.trim(),
        uploadedBy: currentUser.uid,
        organizationId: userWithData.userData.organizationId,
        status: 'uploaded',
        summary: finalContractText, // Store full contract text, not truncated
        extractedClauses: [],
        fileName: fileName || 'manual_input.txt',
        riskLevel: 'Unknown'
      });

      setIsLoading(false);
      
      navigation.navigate('ContractList');
      
    } catch (error: any) {
      setIsLoading(false);
      Alert.alert('Upload Failed', 'Unable to upload contract. Please try again.');
    }
  };

  const categories = [
    'Employment', 'Rental', 'Service Agreement', 'Purchase', 'Partnership', 'NDA', 'Other'
  ];

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Upload Contract</Text>
          <Text style={styles.subtitle}>Scan document or enter contract details</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Document Input</Text>
          
          <View style={styles.inputMethodContainer}>
            <TouchableOpacity
              style={[styles.inputMethodButton, selectedInputMethod === 'scan' ? styles.inputMethodButtonActive : null]}
              onPress={() => {
                setSelectedInputMethod('scan');
                openScanPopup();
              }}
              disabled={isLoading}
            >
              <Text style={[styles.inputMethodButtonText, selectedInputMethod === 'scan' ? styles.inputMethodButtonTextActive : null]}>📄 Scan Document</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.inputMethodButton, selectedInputMethod === 'manual' ? styles.inputMethodButtonActive : null]}
              onPress={() => {
                setSelectedInputMethod('manual');
                handleManualInput();
              }}
              disabled={isLoading}
            >
              <Text style={[styles.inputMethodButtonText, selectedInputMethod === 'manual' ? styles.inputMethodButtonTextActive : null]}>✏️ Manual Input</Text>
            </TouchableOpacity>
          </View>

          

          <Text style={styles.sectionTitle}>Contract Information</Text>
          
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Contract Title <Text style={styles.requiredStar}>*</Text></Text>
            <TextInput
              style={[styles.input, titleError && styles.inputError]}
              placeholder="e.g., Employment Agreement"
              placeholderTextColor="#999"
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                setTitleError(false);
              }}
              editable={!isLoading}
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Category <Text style={styles.requiredStar}>*</Text></Text>
            <View style={styles.categoryContainer}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryButton,
                    category === cat && styles.categoryButtonActive
                  ]}
                  onPress={() => {
                    setCategory(cat);
                    setCategoryError(false);
                  }}
                  disabled={isLoading}
                >
                  <Text style={[
                    styles.categoryButtonText,
                    category === cat && styles.categoryButtonTextActive
                  ]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={styles.sectionTitle}>Contract Text</Text>
          {selectedInputMethod === 'manual' ? (
            <View style={styles.structuredFieldsContainer}>
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Summary <Text style={styles.requiredStar}>*</Text></Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="e.g., Brief description of the contract"
                  placeholderTextColor="#999"
                  value={summary}
                  onChangeText={setSummary}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Parties <Text style={styles.optionalText}>(Optional)</Text></Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="e.g., Company A and Company B"
                  placeholderTextColor="#999"
                  value={parties}
                  onChangeText={setParties}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Rules <Text style={styles.optionalText}>(Optional)</Text></Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="e.g., Governing laws, dispute resolution"
                  placeholderTextColor="#999"
                  value={rules}
                  onChangeText={setRules}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Terms <Text style={styles.optionalText}>(Optional)</Text></Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="e.g., Contract terms and conditions"
                  placeholderTextColor="#999"
                  value={terms}
                  onChangeText={setTerms}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Conditions <Text style={styles.optionalText}>(Optional)</Text></Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="e.g., Special conditions or requirements"
                  placeholderTextColor="#999"
                  value={conditions}
                  onChangeText={setConditions}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Obligations <Text style={styles.optionalText}>(Optional)</Text></Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="e.g., Responsibilities of each party"
                  placeholderTextColor="#999"
                  value={obligations}
                  onChangeText={setObligations}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Penalties <Text style={styles.optionalText}>(Optional)</Text></Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="e.g., Breach consequences, fines"
                  placeholderTextColor="#999"
                  value={penalties}
                  onChangeText={setPenalties}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Duration <Text style={styles.optionalText}>(Optional)</Text></Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="e.g., Contract period, start/end dates"
                  placeholderTextColor="#999"
                  value={duration}
                  onChangeText={setDuration}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Payment <Text style={styles.optionalText}>(Optional)</Text></Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="e.g., Payment terms, amounts, schedule"
                  placeholderTextColor="#999"
                  value={payment}
                  onChangeText={setPayment}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Additional Notes <Text style={styles.optionalText}>(Optional)</Text></Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="Any additional information or special clauses"
                  placeholderTextColor="#999"
                  value={additionalNotes}
                  onChangeText={setAdditionalNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>
            </View>
          ) : (
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Contract Content <Text style={styles.requiredStar}>*</Text></Text>
              <TextInput
                style={[styles.textArea, textError && styles.inputError]}
                placeholder="Paste or type the contract text here..."
                placeholderTextColor="#999"
                value={contractText}
                onChangeText={(text) => {
                  setContractText(text);
                  setTextError(false);
                }}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
                editable={!isLoading}
              />
              <Text style={styles.characterCount}>
                {contractText.length} characters
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleUpload}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Uploading...' : 'Upload Contract'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={isLoading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Custom Scan Popup */}
      <Modal
        visible={showScanPopup}
        transparent={true}
        animationType="none"
        onRequestClose={hideScanPopup}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={hideScanPopup}
        >
          <Animated.View
            style={[
              styles.popupContainer,
              {
                transform: [
                  {
                    scale: popupAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                  {
                    translateY: popupAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, 0],
                    }),
                  },
                ],
                opacity: popupAnimation,
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => null}
            >
                             {isProcessing ? (
                 // Processing State
                 <View style={styles.processingContainer}>
                   <View style={styles.processingIcon}>
                     {showSuccess ? (
                       <Text style={styles.successIcon}>✅</Text>
                     ) : (
                       <Animated.View
                         style={[
                           styles.spinner,
                           {
                             transform: [
                               {
                                 rotate: spinnerRotation.interpolate({
                                   inputRange: [0, 1],
                                   outputRange: ['0deg', '360deg'],
                                 }),
                               },
                             ],
                           },
                         ]}
                       />
                     )}
                   </View>
                   <Text style={styles.processingTitle}>
                     {showSuccess ? 'Success!' : 'Processing Document'}
                   </Text>
                   <Text style={styles.processingStep}>{processingStep}</Text>
                   
                                       {!showSuccess && (
                      <View style={styles.progressBarContainer}>
                        <View style={styles.progressBar}>
                          <View style={styles.progressFill} />
                        </View>
                      </View>
                    )}
                    

                 </View>
               ) : (
                // Normal State
                <>
                  <View style={styles.popupHeader}>
                    <Text style={styles.popupTitle}>📄 Scan Document</Text>
                    <Text style={styles.popupSubtitle}>Choose how to scan your document</Text>
                  </View>

                  <View style={styles.popupOptions}>
                    <TouchableOpacity
                      style={styles.popupOption}
                      onPress={handleCameraOption}
                    >
                      <View style={styles.optionIcon}>
                        <Text style={styles.optionIconText}>📷</Text>
                      </View>
                      <View style={styles.optionContent}>
                        <Text style={styles.optionTitle}>Camera</Text>
                        <Text style={styles.optionDescription}>Take a photo of your document</Text>
                      </View>
                      <View style={styles.optionArrow}>
                        <Text style={styles.arrowText}>›</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.popupOption}
                      onPress={handleFilePickerOption}
                    >
                      <View style={styles.optionIcon}>
                        <Text style={styles.optionIconText}>📁</Text>
                      </View>
                      <View style={styles.optionContent}>
                        <Text style={styles.optionTitle}>Pick File</Text>
                        <Text style={styles.optionDescription}>Select from your device</Text>
                      </View>
                      <View style={styles.optionArrow}>
                        <Text style={styles.arrowText}>›</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.popupCancelButton}
                    onPress={hideScanPopup}
                  >
                    <Text style={styles.popupCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
  },
  form: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
    marginTop: 12,
  },
  inputMethodContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  inputMethodButton: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
  },
  inputMethodButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#e3f2fd',
  },
  inputMethodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  inputMethodButtonTextActive: {
    color: '#007AFF',
  },
  scannedInfo: {
    backgroundColor: '#e8f5e8',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  scannedInfoText: {
    fontSize: 10,
    color: '#2e7d32',
    marginBottom: 1,
  },
  fieldContainer: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  requiredStar: {
    color: 'red',
    fontSize: 14,
  },
  optionalText: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    fontSize: 12,
    backgroundColor: 'white',
    color: '#333',
  },
  inputError: {
    borderColor: 'red',
    borderWidth: 1,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f8f9fa',
  },
  categoryButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: 'white',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    fontSize: 12,
    backgroundColor: 'white',
    color: '#333',
    minHeight: 100,
  },
  characterCount: {
    fontSize: 10,
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 12,
  },
  // Popup styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  popupContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 0,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  popupHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  popupTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 3,
  },
  popupSubtitle: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  popupOptions: {
    padding: 6,
  },
  popupOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#f8f9fa',
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionIconText: {
    fontSize: 20,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 1,
  },
  optionDescription: {
    fontSize: 10,
    color: '#666',
  },
  optionArrow: {
    width: 24,
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 16,
    color: '#999',
    fontWeight: 'bold',
  },
  popupCancelButton: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    alignItems: 'center',
  },
  popupCancelText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  // Processing styles
  processingContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  spinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#007AFF',
    borderTopColor: 'transparent',
  },
  successIcon: {
    fontSize: 32,
  },
  processingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
    textAlign: 'center',
  },
  processingStep: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  progressBarContainer: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    width: '80%',
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
    width: '100%',
  },
  structuredFieldsContainer: {
    marginTop: 12,
  },
  structuredInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    fontSize: 12,
    backgroundColor: 'white',
    color: '#333',
    minHeight: 80,
  },
}); 
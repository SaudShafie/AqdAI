// screens/LoginScreen.tsx - This is the main login and registration screen

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
    Alert,
    FlatList,
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
import { login, register } from '../auth';
import { createOrganization, createUserDocument, getOrganizationByCode, type UserRole } from '../firebaseServices';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

/**
 * Main login and registration screen component
 * Handles both user login and new user registration
 * Supports different user roles and organization setup
 */
export default function LoginScreen({ navigation }: Props) {
  // Form state variables - these store what the user types
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('standalone');
  const [organizationCode, setOrganizationCode] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  
  // Validation states - track which fields have errors
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [orgCodeError, setOrgCodeError] = useState(false);

  // Role options for dropdown - different account types users can choose
  const roleOptions = [
    { value: 'standalone', label: 'Personal', description: 'Individual use' },
    { value: 'org_user', label: 'Organization', description: 'Company use' },
    { value: 'admin', label: 'Administrator', description: 'Manage organization' }
  ];

  /**
   * Gets the display text for the selected role
   * Shows user-friendly names instead of technical role names
   */
  const getRoleDisplayText = () => {
    const selectedRole = roleOptions.find(option => option.value === role);
    return selectedRole ? selectedRole.label : 'Select account type';
  };

  /**
   * Handles user login with email and password
   * Validates form fields and shows appropriate error messages
   * Calls the auth service to authenticate the user
   */
  const handleLogin = async () => {
    // Reset errors - clear any previous error states
    setEmailError(false);
    setPasswordError(false);
    
    if (!email || !password) {
      if (!email) setEmailError(true);
      if (!password) setPasswordError(true);
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      // Login success - navigation handled by auth state change in App.tsx
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles new user registration
   * Creates user account and sets up their profile based on role
   * Handles organization setup for org users
   */
  const handleRegister = async () => {
    // Reset errors - clear any previous error states
    setEmailError(false);
    setPasswordError(false);
    setNameError(false);
    setOrgCodeError(false);
    
    if (!email || !password || !fullName) {
      if (!fullName) setNameError(true);
      if (!email) setEmailError(true);
      if (!password) setPasswordError(true);
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    if (role === 'org_user' && !organizationCode) {
      setOrgCodeError(true);
      Alert.alert('Missing Information', 'Please enter organization code');
      return;
    }

    setIsLoading(true);
    try {
      // Register user with Firebase Auth - this creates the authentication account
      const user = await register(email, password);

      // Prepare user data
      const userData: Partial<{
        fullName: string;
        email: string;
        phone: string;
        role: UserRole;
        organizationId: string | null;
        status: 'pending' | 'approved';
        language: 'en' | 'ar';
      }> = {
        fullName,
        email,
        phone: phone || '',
        status: 'pending', // All users start as pending
        language: 'en'
      };

      // If org_user, validate organization code but don't assign role yet
      if (role === 'org_user') {
        const organization = await getOrganizationByCode(organizationCode);
        if (!organization) {
          setOrgCodeError(true);
          throw new Error('Invalid organization code. Please check with your administrator.');
        }
        userData.organizationId = organization.id;
        userData.role = 'org_user'; // Set temporary role for routing
        // Admin will reassign role during approval
      }

      // If admin, create organization and auto-approve
      if (role === 'admin') {
        if (!organizationCode) {
          setOrgCodeError(true);
          throw new Error('Please enter an organization code for your organization.');
        }
        
        // Check if organization already exists
        const existingOrg = await getOrganizationByCode(organizationCode);
        
        // Create organization for admin
        const organizationId = await createOrganization({
          name: fullName.split(' ')[0] + "'s Organization", // Default name
          code: organizationCode,
          createdBy: user.uid
        });
        
        userData.organizationId = organizationId;
        
        // If organization didn't exist before, this is the creator
        // If it existed, this is a regular admin
        if (!existingOrg) {
          userData.role = 'creator'; // First admin becomes creator
        } else {
          userData.role = 'admin'; // Subsequent admins are regular admins
        }
        
        userData.status = 'approved'; // Admin/creator is auto-approved since they create the organization
      }

      // If standalone, set role immediately
      if (role === 'standalone') {
        userData.role = 'standalone';
        userData.status = 'approved'; // Standalone users are auto-approved
      }

      // Create user document in Firestore
      await createUserDocument(user.uid, userData);

      if (role === 'admin') {
        // Check if organization already exists for success message
        const existingOrg = await getOrganizationByCode(organizationCode);
        const isCreator = !existingOrg;
        Alert.alert('Success', `Registration successful! You can now login as an ${isCreator ? 'organization creator' : 'administrator'}.`);
      } else {
        Alert.alert(
          'Registration Submitted', 
          'Your registration has been submitted and is pending administrator approval. You will be able to access the application once approved.'
        );
      }
      
      setIsRegistering(false);
      setEmail('');
      setPassword('');
      setFullName('');
      setPhone('');
      setRole('standalone');
      setOrganizationCode('');
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>AqdAI</Text>
          <Text style={[styles.subtitle, { textAlign: 'center' }]}>
            {isRegistering 
              ? 'Create your account to get started' 
              : 'Welcome back! Please sign in to continue'
            }
          </Text>
        </View>

        <View style={styles.form}>
          {isRegistering && (
            <>
              <Text style={styles.sectionTitle}>Personal Information</Text>
              
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Full Name <Text style={styles.requiredStar}>*</Text></Text>
                <TextInput
                  style={[styles.input, nameError && styles.inputError]}
                  placeholder="e.g., John Smith"
                  placeholderTextColor="#999"
                  value={fullName}
                  onChangeText={(text) => {
                    setFullName(text);
                    setNameError(false);
                  }}
                  autoCapitalize="words"
                />
              </View>
              
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Phone Number (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., +1234567890"
                  placeholderTextColor="#999"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>
              
              {/* Role Selection */}
              <Text style={styles.sectionTitle}>Account Type</Text>
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Account Type <Text style={styles.requiredStar}>*</Text></Text>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setShowRoleDropdown(true)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownButtonText}>{getRoleDisplayText()}</Text>
                    <Text style={styles.dropdownDescription}>
                      {roleOptions.find(option => option.value === role)?.description || 'Select account type'}
                    </Text>
                  </View>
                  <View style={styles.dropdownArrowContainer}>
                    <Text style={styles.dropdownArrow}>▼</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Role Dropdown Modal */}
              <Modal
                visible={showRoleDropdown}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowRoleDropdown(false)}
              >
                <TouchableOpacity
                  style={styles.modalOverlay}
                  activeOpacity={1}
                  onPress={() => setShowRoleDropdown(false)}
                >
                  <View style={styles.dropdownModal}>
                    <View style={styles.dropdownHeader}>
                      <Text style={styles.dropdownTitle}>Choose Account Type</Text>
                      <TouchableOpacity 
                        style={styles.closeButtonContainer}
                        onPress={() => setShowRoleDropdown(false)}
                      >
                        <Text style={styles.closeButton}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <FlatList
                      data={roleOptions}
                      keyExtractor={(item) => item.value}
                      showsVerticalScrollIndicator={false}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[
                            styles.dropdownOption,
                            role === item.value && styles.dropdownOptionSelected
                          ]}
                          onPress={() => {
                            setRole(item.value as UserRole);
                            setShowRoleDropdown(false);
                          }}
                        >
                          <View style={styles.optionContent}>
                            <View style={styles.optionTextContainer}>
                              <Text style={[
                                styles.dropdownOptionText,
                                role === item.value && styles.dropdownOptionTextSelected
                              ]}>
                                {item.label}
                              </Text>
                              <Text style={[
                                styles.dropdownOptionDescription,
                                role === item.value && styles.dropdownOptionDescriptionSelected
                              ]}>
                                {item.description}
                              </Text>
                            </View>
                          </View>
                          {role === item.value && (
                            <View style={styles.checkmarkContainer}>
                              <View style={styles.checkmarkCircle}>
                                <Text style={styles.checkmark}>✓</Text>
                              </View>
                            </View>
                          )}
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                </TouchableOpacity>
              </Modal>

              {/* Organization Code Input */}
              {(role === 'org_user' || role === 'admin') && (
                <>
                  <Text style={styles.sectionTitle}>
                    {role === 'admin' ? 'Organization Setup' : 'Organization Details'}
                  </Text>
                  <View style={styles.hintContainer}>
                    <Text style={styles.hintIcon}>💡</Text>
                    <Text style={styles.instructionText}>
                      {role === 'admin' 
                        ? 'Enter a unique code for your organization' 
                        : 'Contact your administrator for the organization code'
                      }
                    </Text>
                  </View>
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Organization Code <Text style={styles.requiredStar}>*</Text></Text>
                    <TextInput
                      style={[styles.input, orgCodeError && styles.inputError]}
                      placeholder={role === 'admin' ? "e.g., MY-ORG-2024" : "e.g., ORG-2024"}
                      placeholderTextColor="#999"
                      value={organizationCode}
                      onChangeText={(text) => {
                        setOrganizationCode(text);
                        setOrgCodeError(false);
                      }}
                      autoCapitalize="characters"
                    />
                  </View>
                </>
              )}
            </>
          )}

          <Text style={styles.sectionTitle}>Login Credentials</Text>
          
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Email Address <Text style={styles.requiredStar}>*</Text></Text>
            <TextInput
              style={[styles.input, emailError && styles.inputError]}
              placeholder="e.g., user@example.com"
              placeholderTextColor="#999"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setEmailError(false);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Password <Text style={styles.requiredStar}>*</Text></Text>
            <TextInput
              style={[styles.input, passwordError && styles.inputError]}
              placeholder="Enter your password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError(false);
              }}
              secureTextEntry
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={() => {
              console.log('Login button pressed');
              if (isRegistering) {
                handleRegister();
              } else {
                handleLogin();
              }
            }}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Please wait...' : (isRegistering ? 'Create Account' : 'Sign In')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsRegistering(!isRegistering)}
          >
            <Text style={styles.switchButtonText}>
              {isRegistering 
                ? 'Already have an account? Sign In' 
                : "Don't have an account? Create Account"
              }
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    justifyContent: 'center',
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 30,
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    fontSize: 13,
    backgroundColor: 'white',
    color: '#333',
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
  inputError: {
    borderColor: 'red',
    borderWidth: 1,
  },
  roleContainer: {
    marginBottom: 12,
  },
  roleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  roleButtonText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  roleButtonTextActive: {
    color: 'white',
  },
  roleButtonSubtext: {
    fontSize: 9,
    color: '#999',
    marginTop: 1,
  },
  roleButtonSubtextActive: {
    color: '#ccc',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
    marginTop: 12,
  },
  instructionText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  hintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 5,
    padding: 6,
  },
  hintIcon: {
    fontSize: 14,
    marginRight: 5,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  switchButtonText: {
    color: '#007AFF',
    fontSize: 11,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8eaed',
    borderRadius: 8,
    padding: 10,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  dropdownButtonText: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  dropdownArrow: {
    fontSize: 9,
    color: '#5f6368',
    fontWeight: '300',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dropdownModal: {
    backgroundColor: 'white',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    maxHeight: '50%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  closeButton: {
    fontSize: 14,
    color: '#5f6368',
    fontWeight: '400',
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingRight: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  dropdownOptionSelected: {
    backgroundColor: '#f0f8ff',
    borderLeftWidth: 3,
    borderLeftColor: '#1a73e8',
  },
  dropdownOptionText: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  dropdownOptionTextSelected: {
    color: '#1a73e8',
    fontWeight: '600',
  },
  dropdownOptionDescription: {
    fontSize: 11,
    color: '#5f6368',
    marginTop: 1,
    lineHeight: 14,
  },
  dropdownOptionDescriptionSelected: {
    color: '#1a73e8',
  },
  checkmark: {
    fontSize: 11,
    color: 'white',
    fontWeight: 'bold',
  },
  dropdownContent: {
    flex: 1,
  },
  dropdownDescription: {
    fontSize: 10,
    color: '#5f6368',
    marginTop: 1,
    lineHeight: 12,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIconContainer: {
    width: 26,
    alignItems: 'center',
    marginRight: 8,
  },
  optionIcon: {
    fontSize: 20,
  },
  optionTextContainer: {
    flex: 1,
  },
  checkmarkContainer: {
    marginLeft: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1a73e8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1a73e8',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  closeButtonContainer: {
    padding: 4,
  },
  dropdownArrowContainer: {
    marginLeft: 8,
  },
});

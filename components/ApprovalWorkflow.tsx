// components/ApprovalWorkflow.tsx - This component handles contract approval workflow

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { getCurrentUserWithData } from '../auth';
import { approveRejectContract, assignContract, getUsersByRole } from '../firebaseServices';

interface ApprovalWorkflowProps {
  contractId: string;
  contractStatus: string;
  organizationId: string;
  userRole: string;
  onStatusUpdate: () => void;
}

/**
 * Approval workflow component for contracts
 * Handles assignment, approval, and rejection of contracts
 * Shows different actions based on user role and contract status
 */
export default function ApprovalWorkflow({ 
  contractId, 
  contractStatus, 
  organizationId, 
  userRole, 
  onStatusUpdate 
}: ApprovalWorkflowProps) {
  // State variables for managing approval workflow
  const [loading, setLoading] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [showApprovalForm, setShowApprovalForm] = useState(false);

  // Permission checks based on user role - determines what actions user can take
  const canAnalyze = userRole === 'admin' || userRole === 'creator' || userRole === 'legal_assistant';
  const canApprove = userRole === 'admin' || userRole === 'creator';
  const canAssign = userRole === 'admin' || userRole === 'creator';
  const canReject = userRole === 'admin' || userRole === 'creator' || userRole === 'legal_assistant';

  /**
   * Assigns the contract to a legal assistant for review
   * Finds available legal assistants and assigns to the first one
   * In a real app, you'd show a picker to choose which legal assistant
   */
  const handleAssign = async () => {
    try {
      setLoading(true);
      
      // Get legal assistants in the organization - these are the reviewers
      const legalAssistants = await getUsersByRole(organizationId, 'legal_assistant');
      
      if (legalAssistants.length === 0) {
        Alert.alert('No Legal Assistants', 'No legal assistants found in your organization.');
        return;
      }

      // For now, assign to the first legal assistant
      // In a real app, you'd show a picker to choose which legal assistant
      const firstLegalAssistant = legalAssistants[0];
      
      await assignContract(contractId, firstLegalAssistant.id);
      onStatusUpdate();
    } catch (error: any) {
      console.error('Failed to assign contract:', error);
      Alert.alert('Assignment Failed', 'Unable to assign contract. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Approves the contract with a comment
   * Requires approval comment and updates contract status
   */
  const handleApprove = async () => {
    if (!approvalComment.trim()) {
      Alert.alert('Missing Information', 'Please provide an approval comment');
      return;
    }

    try {
      setLoading(true);
      const currentUser = await getCurrentUserWithData();
      if (!currentUser?.uid) {
        Alert.alert('Access Denied', 'Please log in to approve contracts');
        return;
      }

      await approveRejectContract(contractId, currentUser.uid, true, approvalComment);
      setApprovalComment('');
      setShowApprovalForm(false);
      onStatusUpdate();
    } catch (error: any) {
      console.error('Failed to approve contract:', error);
      Alert.alert('Approval Failed', 'Unable to approve contract. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Rejects the contract with a reason
   * Requires rejection reason and updates contract status
   */
  const handleReject = async () => {
    if (!approvalComment.trim()) {
      Alert.alert('Missing Information', 'Please provide a rejection reason');
      return;
    }

    try {
      setLoading(true);
      const currentUser = await getCurrentUserWithData();
      if (!currentUser?.uid) {
        Alert.alert('Access Denied', 'Please log in to reject contracts');
        return;
      }

      await approveRejectContract(contractId, currentUser.uid, false, approvalComment);
      setApprovalComment('');
      setShowApprovalForm(false);
      onStatusUpdate();
    } catch (error: any) {
      console.error('Failed to reject contract:', error);
      Alert.alert('Rejection Failed', 'Unable to reject contract. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusDisplay = () => {
    switch (contractStatus) {
      case 'uploaded':
        return { text: '📄 Uploaded', color: '#007bff' };
      case 'reviewed':
        return { text: '👀 Under Review', color: '#ffc107' };
      case 'analyzed':
        return { text: '🤖 Analyzed', color: '#17a2b8' };
      case 'approved':
        return { text: '✅ Approved', color: '#28a745' };
      case 'rejected':
        return { text: '❌ Rejected', color: '#dc3545' };
      default:
        return { text: '📄 Uploaded', color: '#007bff' };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Approval Workflow</Text>
      
      {/* Status Display */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>Status:</Text>
        <Text style={[styles.statusText, { color: statusDisplay.color }]}>
          {statusDisplay.text}
        </Text>
      </View>

      {/* Action Buttons */}
      {canAssign && contractStatus === 'uploaded' && (
        <TouchableOpacity
          style={[styles.actionButton, styles.assignButton]}
          onPress={handleAssign}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>📋 Assign to Legal Assistant</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Legal Assistant can analyze after assignment */}
      {userRole === 'legal_assistant' && contractStatus === 'reviewed' && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            📋 This contract has been assigned to you. You can now analyze it and provide recommendations.
          </Text>
        </View>
      )}

      {/* Admin/Creator can approve/reject after analysis */}
      {canApprove && (contractStatus === 'analyzed' || contractStatus === 'reviewed') && (
        <View style={styles.approvalContainer}>
          {!showApprovalForm ? (
            <View style={styles.approvalButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                onPress={() => setShowApprovalForm(true)}
              >
                <Text style={styles.buttonText}>✅ Approve Contract</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => setShowApprovalForm(true)}
              >
                <Text style={styles.buttonText}>❌ Reject Contract</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.approvalForm}>
              <TextInput
                style={styles.commentInput}
                placeholder="Enter your approval/rejection comment..."
                value={approvalComment}
                onChangeText={setApprovalComment}
                multiline
                numberOfLines={3}
              />
              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={handleApprove}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.buttonText}>✅ Approve</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={handleReject}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.buttonText}>❌ Reject</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={() => {
                    setShowApprovalForm(false);
                    setApprovalComment('');
                  }}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Legal Assistant can reject if needed */}
      {userRole === 'legal_assistant' && contractStatus === 'reviewed' && (
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => setShowApprovalForm(true)}
        >
          <Text style={styles.buttonText}>❌ Reject Contract</Text>
        </TouchableOpacity>
      )}

      {/* Info for org users */}
      {userRole === 'org_user' && contractStatus === 'uploaded' && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            📋 Your contract has been uploaded and is waiting for review by a legal assistant.
          </Text>
        </View>
      )}

      {userRole === 'org_user' && contractStatus === 'reviewed' && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            👀 Your contract is currently under review by a legal assistant.
          </Text>
        </View>
      )}

      {userRole === 'org_user' && contractStatus === 'analyzed' && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            🤖 Your contract has been analyzed and is awaiting approval.
          </Text>
        </View>
      )}

      {userRole === 'org_user' && contractStatus === 'approved' && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            ✅ Your contract has been approved!
          </Text>
        </View>
      )}

      {userRole === 'org_user' && contractStatus === 'rejected' && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            ❌ Your contract has been rejected. Please review the comments and resubmit if needed.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 10,
    color: '#333',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  assignButton: {
    backgroundColor: '#17a2b8',
  },
  approveButton: {
    backgroundColor: '#28a745',
  },
  rejectButton: {
    backgroundColor: '#dc3545',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  approvalContainer: {
    marginTop: 10,
  },
  approvalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  approvalForm: {
    marginTop: 10,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoContainer: {
    backgroundColor: '#e7f3ff',
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007bff',
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
}); 
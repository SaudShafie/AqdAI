// components/CommentsSection.tsx - This component handles comments on contracts

import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { getCurrentUserWithData } from '../auth';
import { createComment, getContractComments, type Comment } from '../firebaseServices';

interface CommentsSectionProps {
  contractId: string;
  userRole: string;
  language?: 'en' | 'ar';
}

/**
 * Comments section component for contracts
 * Allows users to add comments and view existing ones
 * Supports different user roles with different styling
 */
export default function CommentsSection({ contractId, userRole, language = 'en' }: CommentsSectionProps) {
  // State variables for managing comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load comments when component mounts or contractId changes
  useEffect(() => {
    loadComments();
  }, [contractId]);

  /**
   * Loads all comments for the current contract
   * Fetches comments from Firestore and updates the state
   */
  const loadComments = async () => {
    try {
      setLoading(true);
      const commentsData = await getContractComments(contractId);
      setComments(commentsData);
    } catch (error: any) {
      console.error('Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Submits a new comment to the contract
   * Validates input and creates comment in Firestore
   * Reloads comments after successful submission
   */
  const submitComment = async () => {
    const commentText = newComment.trim();
    if (!commentText) {
      Alert.alert('Missing Information', 'Please enter a comment');
      return;
    }

    try {
      setSubmitting(true);
      const currentUser = await getCurrentUserWithData();
      if (!currentUser?.userData) {
        Alert.alert('Access Denied', 'Please log in to add comments');
        return;
      }

      // Determine if this is an admin comment based on user role
      const isAdminComment = userRole === 'admin' || userRole === 'creator' || userRole === 'legal_assistant';

      await createComment({
        contractId,
        userId: currentUser.uid,
        userName: currentUser.userData.fullName,
        userRole: currentUser.userData.role,
        message: newComment.trim(),
        isAdminComment
      });

      setNewComment('');
      await loadComments(); // Reload comments to show the new one
      
    } catch (error: any) {
      console.error('Failed to submit comment:', error);
      Alert.alert('Comment Failed', 'Unable to add comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Formats timestamp into readable date string
   * Handles both Firestore timestamps and regular Date objects
   */
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  /**
   * Renders a single comment with appropriate styling
   * Shows different styles for admin vs regular user comments
   */
  const renderComment = (item: Comment) => (
    <View key={item.id} style={[
      styles.commentContainer,
      item.isAdminComment && styles.adminCommentContainer
    ]}>
      <View style={styles.commentHeader}>
        <Text style={[
          styles.userName,
          item.isAdminComment && styles.adminUserName
        ]}>
          {item.userName}
        </Text>
        <Text style={styles.userRole}>
          {item.userRole === 'admin' ? '👑 Admin' :
           item.userRole === 'creator' ? '👑 Creator' :
           item.userRole === 'legal_assistant' ? '⚖️ Legal Assistant' :
           '👤 Org User'}
        </Text>
      </View>
      <Text style={styles.commentMessage}>{item.message}</Text>
      <Text style={styles.commentDate}>{formatDate(item.createdAt)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>
        {language === 'ar' ? 'التعليقات' : 'Comments'}
      </Text>
      
      {/* Add Comment */}
      <View style={styles.addCommentContainer}>
        <TextInput
          style={styles.commentInput}
          placeholder={language === 'ar' ? 'أضف تعليقاً...' : 'Add a comment...'}
          value={newComment}
          onChangeText={setNewComment}
          multiline
          numberOfLines={3}
        />
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={submitComment}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>
              {language === 'ar' ? 'إرسال التعليق' : 'Post Comment'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Comments List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>
            {language === 'ar' ? 'جاري تحميل التعليقات...' : 'Loading comments...'}
          </Text>
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {language === 'ar' ? 'لا توجد تعليقات بعد. كن أول من يعلق!' : 'No comments yet. Be the first to comment!'}
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.commentsList}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
          {comments.map(renderComment)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  addCommentContainer: {
    marginBottom: 20,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  submitButton: {
    backgroundColor: '#007bff',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 8,
    color: '#666',
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#666',
    fontSize: 12,
  },
  commentsList: {
    // Remove maxHeight to avoid VirtualizedList nesting issue
  },
  commentContainer: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007bff',
  },
  adminCommentContainer: {
    backgroundColor: '#fff3cd',
    borderLeftColor: '#ffc107',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  adminUserName: {
    color: '#856404',
  },
  userRole: {
    fontSize: 10,
    color: '#666',
  },
  commentMessage: {
    fontSize: 11,
    color: '#333',
    lineHeight: 16,
    marginBottom: 6,
  },
  commentDate: {
    fontSize: 10,
    color: '#999',
    textAlign: 'right',
  },
}); 
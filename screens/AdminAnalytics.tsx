import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { RootStackParamList } from '../App';
import { getCurrentUserWithData, type ExtendedUser } from '../auth';
import { db } from '../firebase';
import { getAnalysisCount } from '../firebaseServices';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminAnalytics'>;

interface AnalyticsData {
  totalUsers: number;
  pendingUsers: number;
  approvedUsers: number;
  totalContracts: number;
  approvedContracts: number;
  pendingContracts: number;
  rejectedContracts: number;
  highRiskContracts: number;
  mediumRiskContracts: number;
  lowRiskContracts: number;
  analysisCount: number;
  recentActivity: {
    recentUploads: number;
    recentAnalyses: number;
    recentApprovals: number;
  };
}

export default function AdminAnalytics({ navigation }: Props) {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalUsers: 0,
    pendingUsers: 0,
    approvedUsers: 0,
    totalContracts: 0,
    approvedContracts: 0,
    pendingContracts: 0,
    rejectedContracts: 0,
    highRiskContracts: 0,
    mediumRiskContracts: 0,
    lowRiskContracts: 0,
    analysisCount: 0,
    recentActivity: {
      recentUploads: 0,
      recentAnalyses: 0,
      recentApprovals: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userWithData = await getCurrentUserWithData();
      setUser(userWithData);
      if (userWithData?.userData?.organizationId) {
        loadAnalytics(userWithData.userData.organizationId);
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async (organizationId?: string) => {
    const orgId = organizationId || user?.userData?.organizationId;
    if (!orgId) return;

    try {
      setRefreshing(true);
      
      // Load users analytics
      const usersRef = collection(db, 'users');
      const usersQuery = query(
        usersRef,
        where('organizationId', '==', orgId)
      );
      const usersSnapshot = await getDocs(usersQuery);
      
      const totalUsers = usersSnapshot.size;
      const pendingUsers = usersSnapshot.docs.filter(doc => doc.data().status === 'pending').length;
      const approvedUsers = usersSnapshot.docs.filter(doc => doc.data().status === 'approved').length;

      // Load contracts analytics
      const contractsRef = collection(db, 'contracts');
      const contractsQuery = query(
        contractsRef,
        where('organizationId', '==', orgId)
      );
      const contractsSnapshot = await getDocs(contractsQuery);
      
      const totalContracts = contractsSnapshot.size;
      const approvedContracts = contractsSnapshot.docs.filter(doc => doc.data().status === 'approved').length;
      const pendingContracts = contractsSnapshot.docs.filter(doc => 
        doc.data().status === 'uploaded' || doc.data().status === 'analyzed' || doc.data().status === 'assigned'
      ).length;
      const rejectedContracts = contractsSnapshot.docs.filter(doc => doc.data().status === 'rejected').length;
      
      // Risk level analytics
      const highRiskContracts = contractsSnapshot.docs.filter(doc => 
        doc.data().riskLevel?.toLowerCase() === 'high'
      ).length;
      const mediumRiskContracts = contractsSnapshot.docs.filter(doc => 
        doc.data().riskLevel?.toLowerCase() === 'medium'
      ).length;
      const lowRiskContracts = contractsSnapshot.docs.filter(doc => 
        doc.data().riskLevel?.toLowerCase() === 'low'
      ).length;

      // Recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentUploads = contractsSnapshot.docs.filter(doc => {
        const createdAt = doc.data().createdAt?.toDate?.();
        return createdAt && createdAt > sevenDaysAgo;
      }).length;

      const recentAnalyses = contractsSnapshot.docs.filter(doc => {
        const analyzedAt = doc.data().analyzedAt?.toDate?.();
        return analyzedAt && analyzedAt > sevenDaysAgo;
      }).length;

      const recentApprovals = contractsSnapshot.docs.filter(doc => {
        const approvedAt = doc.data().approvedAt?.toDate?.();
        return approvedAt && approvedAt > sevenDaysAgo;
      }).length;

      // Get analysis count for the organization
      const analysisCount = await getAnalysisCount(orgId);

      setAnalytics({
        totalUsers,
        pendingUsers,
        approvedUsers,
        totalContracts,
        approvedContracts,
        pendingContracts,
        rejectedContracts,
        highRiskContracts,
        mediumRiskContracts,
        lowRiskContracts,
        analysisCount,
        recentActivity: {
          recentUploads,
          recentAnalyses,
          recentApprovals,
        },
      });

    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getPercentage = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  const getRiskPercentage = (riskCount: number) => {
    const totalAnalyzed = analytics.highRiskContracts + analytics.mediumRiskContracts + analytics.lowRiskContracts;
    return getPercentage(riskCount, totalAnalyzed);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Analytics...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics Dashboard</Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAnalytics()}
            colors={['#007aff']}
            tintColor="#007aff"
          />
        }
      >
        {/* Overview Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewNumber}>{analytics.totalUsers}</Text>
              <Text style={styles.overviewLabel}>Total Users</Text>
            </View>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewNumber}>{analytics.totalContracts}</Text>
              <Text style={styles.overviewLabel}>Total Contracts</Text>
            </View>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewNumber}>{analytics.approvedContracts}</Text>
              <Text style={styles.overviewLabel}>Approved</Text>
            </View>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewNumber}>{analytics.analysisCount}</Text>
              <Text style={styles.overviewLabel}>AI Analyses</Text>
            </View>
          </View>
        </View>

        {/* User Analytics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Management</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analytics.approvedUsers}</Text>
              <Text style={styles.statLabel}>Approved</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analytics.pendingUsers}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          </View>
          
          {analytics.totalUsers > 0 && (
            <View style={styles.progressContainer}>
              <Text style={styles.progressLabel}>User Approval Rate</Text>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${getPercentage(analytics.approvedUsers, analytics.totalUsers)}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {getPercentage(analytics.approvedUsers, analytics.totalUsers)}% approved
              </Text>
            </View>
          )}
        </View>

        {/* Contract Analytics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contract Processing</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analytics.pendingContracts}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analytics.approvedContracts}</Text>
              <Text style={styles.statLabel}>Approved</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analytics.rejectedContracts}</Text>
              <Text style={styles.statLabel}>Rejected</Text>
            </View>
          </View>
          
          {analytics.totalContracts > 0 && (
            <View style={styles.progressContainer}>
              <Text style={styles.progressLabel}>Approval Rate</Text>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${getPercentage(analytics.approvedContracts, analytics.totalContracts)}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {getPercentage(analytics.approvedContracts, analytics.totalContracts)}% approved
              </Text>
            </View>
          )}
        </View>

        {/* Risk Analytics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Risk Analysis</Text>
          <View style={styles.riskStats}>
            <View style={[styles.riskCard, { backgroundColor: '#dc3545' }]}>
              <Text style={styles.riskNumber}>{analytics.highRiskContracts}</Text>
              <Text style={styles.riskLabel}>High Risk</Text>
              <Text style={styles.riskPercentage}>
                {getRiskPercentage(analytics.highRiskContracts)}%
              </Text>
            </View>
            <View style={[styles.riskCard, { backgroundColor: '#ffc107' }]}>
              <Text style={styles.riskNumber}>{analytics.mediumRiskContracts}</Text>
              <Text style={styles.riskLabel}>Medium Risk</Text>
              <Text style={styles.riskPercentage}>
                {getRiskPercentage(analytics.mediumRiskContracts)}%
              </Text>
            </View>
            <View style={[styles.riskCard, { backgroundColor: '#28a745' }]}>
              <Text style={styles.riskNumber}>{analytics.lowRiskContracts}</Text>
              <Text style={styles.riskLabel}>Low Risk</Text>
              <Text style={styles.riskPercentage}>
                {getRiskPercentage(analytics.lowRiskContracts)}%
              </Text>
            </View>
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity (Last 7 Days)</Text>
          <View style={styles.activityGrid}>
            <View style={styles.activityCard}>
              <Text style={styles.activityNumber}>{analytics.recentActivity.recentUploads}</Text>
              <Text style={styles.activityLabel}>New Uploads</Text>
            </View>
            <View style={styles.activityCard}>
              <Text style={styles.activityNumber}>{analytics.analysisCount}</Text>
              <Text style={styles.activityLabel}>AI Analyses</Text>
            </View>
            <View style={styles.activityCard}>
              <Text style={styles.activityNumber}>{analytics.recentActivity.recentApprovals}</Text>
              <Text style={styles.activityLabel}>Approvals</Text>
            </View>
          </View>
        </View>

        {/* Alerts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alerts</Text>
          <View style={styles.alertsContainer}>
            {analytics.pendingUsers > 0 && (
              <View style={styles.alertItem}>
                <Text style={styles.alertIcon}>⚠️</Text>
                <Text style={styles.alertText}>
                  {analytics.pendingUsers} user{analytics.pendingUsers > 1 ? 's' : ''} waiting for approval
                </Text>
              </View>
            )}
            {analytics.highRiskContracts > 0 && (
              <View style={styles.alertItem}>
                <Text style={styles.alertIcon}>🚨</Text>
                <Text style={styles.alertText}>
                  {analytics.highRiskContracts} high-risk contract{analytics.highRiskContracts > 1 ? 's' : ''} detected
                </Text>
              </View>
            )}
            {analytics.pendingContracts > 0 && (
              <View style={styles.alertItem}>
                <Text style={styles.alertIcon}>📋</Text>
                <Text style={styles.alertText}>
                  {analytics.pendingContracts} contract{analytics.pendingContracts > 1 ? 's' : ''} pending analysis
                </Text>
              </View>
            )}
            {analytics.pendingUsers === 0 && analytics.highRiskContracts === 0 && analytics.pendingContracts === 0 && (
              <View style={styles.alertItem}>
                <Text style={styles.alertIcon}>✅</Text>
                <Text style={styles.alertText}>All systems running smoothly</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
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
    fontSize: 16,
    color: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 45,
    paddingBottom: 16,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  overviewGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  overviewCard: {
    alignItems: 'center',
    minWidth: '18%',
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginHorizontal: 2,
  },
  overviewNumber: {
    fontSize: 20,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 2,
  },
  overviewLabel: {
    fontSize: 11,
    color: '#6c757d',
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#6c757d',
    textAlign: 'center',
  },
  progressContainer: {
    marginTop: 6,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e9ecef',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 3,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: '#666',
  },
  riskStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  riskCard: {
    alignItems: 'center',
    flex: 1,
    padding: 12,
    borderRadius: 6,
    marginHorizontal: 3,
  },
  riskNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  riskLabel: {
    fontSize: 11,
    color: 'white',
    fontWeight: '500',
  },
  riskPercentage: {
    fontSize: 9,
    color: 'white',
    marginTop: 2,
  },
  activityGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  activityCard: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  activityNumber: {
    fontSize: 20,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 2,
  },
  activityLabel: {
    fontSize: 11,
    color: '#6c757d',
    textAlign: 'center',
  },
  alertsContainer: {
    marginTop: 12,
    gap: 8,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  alertIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  alertText: {
    fontSize: 13,
    color: '#333',
    flex: 1,
  },
}); 
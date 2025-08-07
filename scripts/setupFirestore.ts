// scripts/setupFirestore.ts - This script initializes the Firestore structure with sample data
// Run this once to set up your database structure and create sample data for testing

import {
  auth, createCategory,
  createContractDocument,
  createNotification,
  createOrganization,
  createUserDocument,
  type Category,
  type Organization
} from '../firebaseServices';

/**
 * Main setup function that initializes Firestore with sample data
 * Creates organizations, categories, contracts, and notifications
 * This is useful for testing and demo purposes
 */
export const setupFirestore = async () => {
  try {
    console.log('🚀 Starting Firestore setup...');

    // Get current user - we need an authenticated user to create data
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to run setup');
    }

    console.log('👤 Current user:', currentUser.email);

    // Create current user document first - this sets up the user profile
    console.log('📝 Creating current user document...');
    await createUserDocument(currentUser.uid, {
      fullName: currentUser.displayName || 'Test User',
      email: currentUser.email || '',
      role: 'admin', // Start as admin for testing - gives full access
      status: 'approved',
      language: 'en'
    });
    console.log('✅ Created user document for:', currentUser.email);

    // Create sample organizations - these represent different companies
    console.log('📋 Creating sample organizations...');
    const orgIds: string[] = [];
    const sampleOrganizations: Partial<Organization>[] = [
      {
        name: "AlNahda Contracting Co.",
        code: "ALN-2024",
        createdBy: currentUser.uid
      },
      {
        name: "Tech Solutions Ltd.",
        code: "TECH-2024",
        createdBy: currentUser.uid
      }
    ];

    for (const org of sampleOrganizations) {
      const orgId = await createOrganization(org);
      orgIds.push(orgId);
      console.log(`✅ Created organization: ${org.name} (${orgId})`);
    }

    // Create sample categories - these help organize contracts
    console.log('📂 Creating sample categories...');
    const sampleCategories: Partial<Category>[] = [
      {
        name: "Employment",
        createdBy: currentUser.uid
      },
      {
        name: "Rental",
        createdBy: currentUser.uid
      },
      {
        name: "Service Agreement",
        createdBy: currentUser.uid
      },
      {
        name: "Purchase",
        createdBy: currentUser.uid
      }
    ];

    for (const category of sampleCategories) {
      const categoryId = await createCategory(category);
      console.log(`✅ Created category: ${category.name} (${categoryId})`);
    }

    // Create sample contract - this demonstrates the contract structure
    console.log('📄 Creating sample contract...');
    const contractId = await createContractDocument({
      title: "Sample Lease Agreement",
      uploadedBy: currentUser.uid,
      organizationId: orgIds[0],
      status: "analyzed",
      category: "Rental",
      summary: "This is a sample lease agreement for testing purposes.",
      extractedClauses: [
        {
          clause: "Rent is due on the 1st of each month",
          type: "Payment",
          dueDate: "2024-01-01"
        }
      ]
    });
    console.log(`✅ Created sample contract: ${contractId}`);

    // Create sample notification
    console.log('🔔 Creating sample notification...');
    const notificationId = await createNotification({
      userId: currentUser.uid,
      contractId: contractId,
      message: "Sample contract created successfully",
      type: "status-update"
    });
    console.log(`✅ Created sample notification: ${notificationId}`);

    console.log('🎉 Firestore setup completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Current User: ${currentUser.email}`);
    console.log(`- Organizations: ${orgIds.length}`);
    console.log(`- Categories: ${sampleCategories.length}`);
    console.log(`- Sample Contract: ${contractId}`);
    console.log(`- Sample Notification: ${notificationId}`);

  } catch (error) {
    console.error('❌ Firestore setup failed:', error);
    throw error;
  }
};

// Export for use in your app
export default setupFirestore; 
// scripts/deployRules.js
// Deploy Firestore security rules to Firebase

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check if firebase.json exists, if not create it
const firebaseJsonPath = path.join(__dirname, '..', 'firebase.json');
if (!fs.existsSync(firebaseJsonPath)) {
  const firebaseConfig = {
    "firestore": {
      "rules": "firestore.rules",
      "indexes": "firestore.indexes.json"
    }
  };
  
  fs.writeFileSync(firebaseJsonPath, JSON.stringify(firebaseConfig, null, 2));
  console.log('✅ Created firebase.json');
}

// Deploy rules
try {
  console.log('🚀 Deploying Firestore security rules...');
  execSync('firebase deploy --only firestore:rules', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('✅ Firestore rules deployed successfully!');
} catch (error) {
  console.error('❌ Failed to deploy rules:', error.message);
  console.log('\n📋 Manual steps:');
  console.log('1. Install Firebase CLI: npm install -g firebase-tools');
  console.log('2. Login to Firebase: firebase login');
  console.log('3. Initialize project: firebase init firestore');
  console.log('4. Deploy rules: firebase deploy --only firestore:rules');
} 
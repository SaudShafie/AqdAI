# AqdAi-ContractAnalyzer

A professional React Native/Expo mobile application for extracting and analyzing text from PDF documents and images, with excellent Arabic text recognition.

## Features

- **Smart PDF Processing**: Automatically detects Arabic content and uses OCR.space API for better Arabic support
- **File Import**: Import existing PDF and image files with drag-and-drop support
- **OCR.space Integration**: Professional OCR API with excellent Arabic text recognition
- **Modern UI**: Beautiful, intuitive interface with professional design
- **Text Sharing**: Share extracted text with other apps
- **Text Management**: Clear and manage extracted text
- **Session Management**: Secure login/logout functionality
- **Processing Info**: See which method was used for text extraction

## Current Status

This project now includes intelligent document processing with excellent Arabic support:

- **Smart PDF Processing**: MuPDF for English, OCR.space for Arabic
- **OCR.space API**: Professional OCR with excellent Arabic support
- **Modern UI**: Beautiful, professional interface
- **Text Sharing**: Share extracted text with other apps
- **Processing Info**: Shows which method was used
- **ML Kit Document Scanner**: Coming in next update

## How to Use

### Smart PDF Processing
1. Tap "Import File" button
2. Select a PDF file
3. App automatically detects Arabic content
4. Uses OCR.space API for Arabic, MuPDF for English
5. Shows processing method used

### Image OCR
1. Tap "Import File" button
2. Select an image file (PNG, JPG, etc.)
3. OCR.space API extracts text with high accuracy
4. Excellent Arabic text recognition

### Text Management
- **Share**: Share extracted text with other apps
- **Clear**: Clear extracted text and start over
- **Info**: See which processing method was used

## Project Structure

- **Frontend**: React Native with Expo
- **Smart Processing**: MuPDF + OCR.space API (automatic selection)
- **OCR Service**: OCR.space API (professional OCR service)
- **File Handling**: Expo Document Picker and File System
- **Authentication**: Expo SecureStore for session management
- **UI**: Modern, professional design with shadows and animations

## Technical Stack

- **Frontend**: React Native with Expo SDK 53
- **Smart OCR**: OCR.space API + MuPDF (automatic selection)
- **PDF Processing**: MuPDF library (English content only)
- **Platform**: Android (iOS support planned)
- **Language**: TypeScript/JavaScript with Kotlin native modules

## Smart Processing Logic

### PDF Processing:
1. **Try MuPDF first** - Extract digital text
2. **Check for Arabic** - Detect Arabic characters
3. **If Arabic found** - Switch to OCR.space API
4. **If English only** - Use MuPDF result
5. **Show method used** - Display processing info

### Image Processing:
1. **OCR.space API** - Professional OCR service
2. **Arabic language** - Optimized for Arabic text
3. **High accuracy** - Uses OCR Engine 2
4. **Multiple formats** - PNG, JPG, etc.

## UI Improvements

- **Modern Design**: Professional color scheme and typography
- **Card Layout**: Clean, organized interface
- **Loading States**: Professional loading indicators
- **Error Handling**: User-friendly error messages
- **Text Actions**: Share and clear functionality
- **Processing Info**: Shows which method was used

## OCR.space API Features

- **Excellent Arabic Support**: Superior Arabic text recognition
- **Multiple Languages**: Supports 20+ languages
- **High Accuracy**: Professional OCR engine
- **Image Processing**: Automatic orientation detection
- **Scalable**: Handles various image formats and sizes

## Requirements

- Android API level 21 or higher
- Internet connection (for OCR.space API)
- OCR.space API key (configured in app)


### IMPORTANT: Firestore vs Firebase Storage Rules

**Firestore Rules** (for database) - You already have these:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Your existing rules for extractedTexts and userProfiles
  }
}
```

**Firebase Storage Rules** (for file uploads) - You need to add these:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow users to upload to their own folder - matches the code path structure
    match /documents/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### How to Set Up Firebase Storage Rules:

1. **Go to Firebase Console**: https://console.firebase.google.com
2. **Select your project**: aqdai-d07a4
3. **Navigate to Storage**: Click "Storage" in the left sidebar
4. **Go to Rules tab**: Click the "Rules" tab
5. **Replace the rules** with the Storage rules above
6. **Click "Publish"**: Save the new rules

### Firebase Firestore Rules
For Firestore, use these rules (you already have these):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Rules for extractedTexts collection
    match /extractedTexts/{document} {
      // Allow only the authenticated user to create their own document
      allow create: if request.auth != null &&
        request.auth.uid == request.resource.data.userId;

      // Allow read/update/delete only if the document belongs to the user
      allow read, update, delete: if request.auth != null &&
        resource.data.userId == request.auth.uid;
    }

    // Rules for userProfiles collection
    match /userProfiles/{document} {
      allow create: if request.auth != null &&
        request.auth.uid == request.resource.data.userId;

      allow read, update, delete: if request.auth != null &&
        resource.data.userId == request.auth.uid;
    }
  }
}
```

## Troubleshooting

### Firebase Storage Upload Issues
If you're getting `storage/unknown` errors:

1. **Check Storage Rules**: Make sure your Firebase Storage rules match the ones above
2. **Enable Storage**: Go to Firebase Console → Storage → Get Started (if not already enabled)
3. **Check Authentication**: Ensure users are properly authenticated before upload
4. **Disable Uploads**: Set `ENABLE_STORAGE_UPLOADS = false` in `firebaseServices.ts` to disable uploads completely

### Firebase Firestore Issues
If you're getting permission errors:

1. **Check Firestore Rules**: Use the rules provided above
2. **Enable Firestore**: Go to Firebase Console → Firestore → Create Database (if not already created)
3. **Check Authentication**: Ensure users are logged in before accessing Firestore

### General Firebase Issues
- **Check Firebase Config**: Ensure `google-services.json` is properly configured
- **Check Internet**: Ensure device has internet connection
- **Check API Keys**: Verify OpenAI and OCR.space API keys are valid

## How to Run the App

### Prerequisites
- Node.js (version 16 or higher)
- npm or yarn
- Android Studio (for Android development)
- Android SDK
- Expo CLI

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ContractAnalyzer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Expo CLI globally** (if not already installed)
   ```bash
   npm install -g @expo/cli
   ```

4. **Start the development server**
   ```bash
   npx expo start
   ```

5. **Run on Android device/emulator**
   ```bash
   npx expo run:android
   ```

### Alternative Commands

- **Start with tunnel** (for testing on physical device):
  ```bash
  npx expo start --tunnel
  ```

- **Start for web development**:
  ```bash
  npx expo start --web
  ```

- **Build for production**:
  ```bash
  npx expo build:android
  ```

### Development Workflow

1. **Start the development server**: `npx react-native run-android`
2. **Scan QR code** with Expo Go app on your phone, or
3. **Press 'a'** to open on Android emulator, or
4. **Press 'w'** to open in web browser

### Environment Setup

1. **Copy the environment template**:
   ```bash
   cp .env.example .env
   ```

2. **Configure your API keys** in the `.env` file:
   - **Firebase Configuration**: Get from Firebase Console → Project Settings → General → Your Apps
   - **OpenAI API Key**: Get from OpenAI Platform → API Keys
   - **OCR.space API Key**: Get from OCR.space → API Key

3. **Firebase Setup**:
   - Create a Firebase project at https://console.firebase.google.com/
   - Enable Authentication, Firestore, and Storage
   - Download `google-services.json` and replace the placeholder in `android/app/src/google-services.json`
   - Update the Firebase configuration in your `.env` file

4. **API Keys Required**:
   - **Firebase**: For authentication, database, and storage
   - **OpenAI**: For AI contract analysis (GPT-4)
   - **OCR.space**: For text extraction from images and PDFs

### Required API Keys

| Service | Purpose | How to Get |
|---------|---------|------------|
| Firebase | Authentication, Database, Storage | Firebase Console → Project Settings |
| OpenAI | AI Contract Analysis | OpenAI Platform → API Keys |
| OCR.space | Text Extraction | OCR.space → API Key |

### Security & GitHub Preparation

This project is configured for secure GitHub deployment:

- **API Keys**: All sensitive keys are moved to environment variables
- **Firebase Config**: Placeholder values in `google-services.json`
- **Environment Template**: `.env.example` file with all required variables
- **Gitignore**: Sensitive files are excluded from version control

**Before pushing to GitHub**:
1. Ensure your `.env` file is not committed (it's in `.gitignore`)
2. Verify all API keys are in environment variables
3. Test the app with placeholder values to ensure it works

### Common Issues

- **Metro bundler issues**: Clear cache with `npx expo start --clear`
- **Android build issues**: Clean Android build with `cd android && ./gradlew clean`
- **Dependency issues**: Delete `node_modules` and run `npm install` again
- **API Key issues**: Check that all environment variables are set in `.env` file

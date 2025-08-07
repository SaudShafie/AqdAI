# GitHub Deployment Guide

This guide will help you safely deploy the Contract Analyzer project to GitHub while protecting sensitive information.

## Pre-Deployment Checklist

### 1. Environment Variables
- [ ] All API keys moved to environment variables
- [ ] `.env.example` file created with placeholders
- [ ] `.env` file added to `.gitignore`
- [ ] No hardcoded API keys in source code

### 2. Firebase Configuration
- [ ] `google-services.json` contains placeholder values
- [ ] Firebase config in `firebase.ts` uses environment variables
- [ ] Firebase config in `firebaseServices.ts` uses environment variables

### 3. API Keys
- [ ] OpenAI API key moved to environment variables
- [ ] OCR.space API key moved to environment variables
- [ ] All upload screens use environment variables

### 4. Security Files
- [ ] `.gitignore` updated to exclude sensitive files
- [ ] Build artifacts excluded (`.apk`, `.aab`, `.ipa`)
- [ ] Log files excluded

## Deployment Steps

### Step 1: Initialize Git Repository
```bash
git init
git add .
git commit -m "Initial commit: Contract Analyzer app"
```

### Step 2: Create GitHub Repository
1. Go to GitHub.com and create a new repository
2. Don't initialize with README (we already have one)
3. Copy the repository URL

### Step 3: Push to GitHub
```bash
git remote add origin <your-repository-url>
git branch -M main
git push -u origin main
```

## For Contributors/Cloners

### Quick Setup
```bash
# Clone the repository
git clone <repository-url>
cd ContractAnalyzer

# Run setup script
npm run setup

# Install dependencies
npm install

# Configure environment variables
# Edit .env file with your API keys

# Start development
npm start
```

### Manual Setup
1. Copy `.env.example` to `.env`
2. Fill in your API keys in `.env`
3. Download `google-services.json` from Firebase Console
4. Replace placeholder in `android/app/src/google-services.json`
5. Run `npm install`
6. Run `npm start`

## Required API Keys

| Service | Purpose | Setup Guide |
|---------|---------|-------------|
| Firebase | Authentication, Database, Storage | [Firebase Setup Guide](https://firebase.google.com/docs/android/setup) |
| OpenAI | AI Contract Analysis | [OpenAI API Keys](https://platform.openai.com/api-keys) |
| OCR.space | Text Extraction | [OCR.space API](https://ocr.space/ocrapi) |

## 🛡️ Security Features

### Environment Variables
- All sensitive data moved to `.env` file
- `.env` file excluded from version control
- Placeholder values in source code

### Firebase Security
- Placeholder `google-services.json` file
- Environment-based configuration
- Secure Firestore rules included

### API Key Protection
- No hardcoded keys in source code
- Environment variable fallbacks
- Clear setup instructions

## Environment Variables

Create a `.env` file with the following variables:

```env
# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key_here
FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
FIREBASE_APP_ID=your_app_id

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# OCR.space Configuration
OCR_SPACE_API_KEY=your_ocr_space_api_key_here
```

## Important Notes

1. **Never commit `.env` files** - They contain sensitive information
2. **Update `google-services.json`** - Replace placeholders with real values
3. **Test with placeholders** - Ensure app works before adding real keys
4. **Use environment variables** - Don't hardcode API keys in source code

## 🆘 Troubleshooting

### Common Issues
- **API Key errors**: Check that all environment variables are set
- **Firebase connection issues**: Verify `google-services.json` configuration
- **Build failures**: Clean and rebuild with `cd android && ./gradlew clean`

### Support
- Check the main README.md for detailed setup instructions
- Run `npm run setup` for automated setup assistance
- Review Firebase and API documentation for service-specific issues 
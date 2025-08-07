#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('Contract Analyzer Setup Script');
console.log('================================\n');

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
              console.log('Creating .env file from template...');
          fs.copyFileSync(envExamplePath, envPath);
          console.log('.env file created successfully!');
      } else {
      console.log('.env.example file not found!');
      process.exit(1);
    }
  } else {
    console.log('.env file already exists');
  }

  console.log('\nNext Steps:');
  console.log('1. Edit the .env file with your API keys');
  console.log('2. Configure Firebase project and download google-services.json');
  console.log('3. Replace the placeholder in android/app/src/google-services.json');
  console.log('4. Run "npm install" to install dependencies');
  console.log('5. Run "npx expo start" to start the development server');

  console.log('\nRequired API Keys:');
  console.log('- Firebase: https://console.firebase.google.com/');
  console.log('- OpenAI: https://platform.openai.com/api-keys');
  console.log('- OCR.space: https://ocr.space/ocrapi');

  console.log('\nFor detailed setup instructions, see README.md'); 
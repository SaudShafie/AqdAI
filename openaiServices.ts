// openaiServices.ts - This file handles all the AI analysis using OpenAI's GPT-4
import axios from 'axios';
import { doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// OpenAI API key from environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your_openai_api_key_here';

// OpenAI API Configuration - this is where we send our requests to OpenAI
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Validates the OpenAI API key format and tests basic connectivity
 * This helps debug authentication issues early
 */
export const validateOpenAIKey = async (): Promise<boolean> => {
  try {
    console.log('Validating OpenAI API key...');
    console.log('API Key format check:', OPENAI_API_KEY.startsWith('sk-proj-') ? '✅ Valid project key format' : '❌ Invalid key format');
    console.log('API Key length:', OPENAI_API_KEY.length);
    
    // Test the API key with a simple request
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000
      }
    );
    
    console.log('✅ OpenAI API key is valid and working');
    return true;
  } catch (error: any) {
    console.error('❌ OpenAI API key validation failed:', error.response?.status, error.response?.statusText);
    console.error('Error details:', error.response?.data);
    
    // Provide specific guidance based on error type
    if (error.response?.status === 401) {
      console.error('🔑 Authentication failed. Please check:');
      console.error('  1. API key is correct and not expired');
      console.error('  2. API key has proper permissions');
      console.error('  3. API key format is valid (should start with sk-proj-)');
    } else if (error.response?.status === 429) {
      console.error('⏰ Rate limit exceeded. Please wait before trying again.');
    } else if (error.response?.status === 503) {
      console.error('🔧 OpenAI service is temporarily unavailable.');
    }
    
    return false;
  }
};

// Interface for analysis results - this defines what we get back from AI analysis
export interface ContractAnalysis {
  extracted_clauses: {
    deadlines?: string;
    responsibilities?: string;
    payment_terms?: string;
    penalties?: string;
    confidentiality?: string;
    termination_conditions?: string;
  };
  summary: string;
  risk_level: 'Low' | 'Medium' | 'High';
}

// Interface for multilingual analysis - supports both English and Arabic
export interface MultilingualAnalysis {
  en?: ContractAnalysis;
  ar?: ContractAnalysis;
}

/**
 * Parses deadline text and extracts actual dates using AI
 * This function takes deadline text from contract analysis and tries to find real dates
 * Useful for setting up deadline reminders and tracking
 */
export const parseDeadlineFromText = async (deadlineText: string): Promise<Date | null> => {
  if (!deadlineText || deadlineText === 'No specific deadlines found') {
    return null;
  }

  try {
    // Send the deadline text to OpenAI for date parsing - AI is better at understanding dates
    const prompt = `
Extract the actual deadline date from the following contract deadline information. 
Return ONLY a valid date in YYYY-MM-DD format. If no specific date is found, return "NO_DATE".

Deadline information: "${deadlineText}"

Rules:
- Look for specific dates, deadlines, due dates, expiration dates
- Convert relative dates (e.g., "30 days from signing") to actual dates
- Handle various date formats and convert to YYYY-MM-DD
- If multiple dates found, return the most critical deadline
- If no specific date, return "NO_DATE"

Response format: YYYY-MM-DD or NO_DATE
`;

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 50
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000 // 10 second timeout - don't wait too long
      }
    );

    const result = response.data.choices[0].message.content.trim();
    
    if (result === 'NO_DATE' || !result) {
      return null;
    }

    // Parse the date - convert string to actual Date object
    const parsedDate = new Date(result);
    
    // Validate the date - make sure it's actually a valid date
    if (isNaN(parsedDate.getTime())) {
      console.warn('Invalid date parsed from deadline text:', result);
      return null;
    }

    return parsedDate;
  } catch (error: any) {
    // Handle network errors gracefully - don't crash if AI service is down
    if (error?.message?.includes('Network Error') || error?.code === 'NETWORK_ERROR') {
      console.log('Network error while parsing deadline - skipping');
    } else if (error?.response?.status === 401) {
      console.error('OpenAI API authentication failed (401). Please check your API key.');
      console.error('API Key (first 10 chars):', OPENAI_API_KEY.substring(0, 10) + '...');
    } else {
      console.error('Error parsing deadline from text:', error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
    }
    return null;
  }
};

/**
 * Calculates how many days are left until a deadline
 * Returns positive number for days remaining, negative for overdue
 * Useful for showing countdown timers and alerts
 */
export const calculateDaysRemaining = (deadline: Date): number => {
  const today = new Date();
  const timeDiff = deadline.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  return daysDiff;
};

/**
 * Formats a deadline message for notifications
 * Creates user-friendly messages like "Contract X expires in 5 days"
 * Different messages based on how urgent the deadline is
 */
export const formatDeadlineMessage = (contractTitle: string, daysRemaining: number): string => {
  if (daysRemaining < 0) {
    return `⚠️ Contract "${contractTitle}" is overdue by ${Math.abs(daysRemaining)} days`;
  } else if (daysRemaining === 0) {
    return `🚨 Contract "${contractTitle}" expires today!`;
  } else if (daysRemaining <= 3) {
    return `⚠️ Contract "${contractTitle}" expires in ${daysRemaining} days`;
  } else if (daysRemaining <= 7) {
    return `📅 Contract "${contractTitle}" expires in ${daysRemaining} days`;
  } else {
    return `📋 Contract "${contractTitle}" expires in ${daysRemaining} days`;
  }
};

/**
 * Creates the AI prompt for contract analysis
 * This function generates different prompts for English and Arabic
 * The prompt tells the AI exactly what to extract from contracts
 */
const createPrompt = (contractText: string, language: 'en' | 'ar' = 'en'): string => {
  const isArabic = language === 'ar';
  
  const prompt = isArabic ? `
أنت مساعد قانوني متخصص في تحليل العقود. من النص التعاقدي أدناه، استخرج البنود الرئيسية واختصرها بمصطلحات بسيطة.

مهم: يجب أن تجيب بـ JSON صحيح فقط. لا نص إضافي، لا تفسيرات، فقط JSON خالص.

استخرج المعلومات التالية:
- المواعيد النهائية: أي متطلبات حساسة للوقت أو تواريخ الاستحقاق
- المسؤوليات: من المسؤول عن أي مهام
- شروط الدفع: كيف ومتى تتم المدفوعات
- العقوبات: عواقب عدم الامتثال أو الإخلال
- السرية: أي متطلبات السرية أو عدم الإفصاح
- شروط الإنهاء: كيف يمكن إنهاء العقد

أيضاً حدد مستوى المخاطر: منخفض / متوسط / عالي بناءً على:
- لغة غامضة أو غير واضحة
- عقوبات أو عواقب غير واضحة
- أقسام مهمة مفقودة
- شروط غير متوازنة
- أحكام غير عادية أو محفوفة بالمخاطر

أجب بـ JSON فقط بهذا التنسيق الدقيق (لا نص آخر):
{
  "extracted_clauses": {
    "deadlines": "معلومات المواعيد النهائية المستخرجة",
    "responsibilities": "معلومات المسؤوليات المستخرجة",
    "payment_terms": "معلومات الدفع المستخرجة",
    "penalties": "معلومات العقوبات المستخرجة",
    "confidentiality": "معلومات السرية المستخرجة",
    "termination_conditions": "معلومات شروط الإنهاء المستخرجة"
  },
  "summary": "ملخص مختصر للعقد",
  "risk_level": "منخفض"
}

نص العقد:
"""${contractText}"""
` : `
You are a legal assistant specializing in contract analysis. From the contract text below, extract key clauses and summarize them in simple terms.

IMPORTANT: You must respond with ONLY valid JSON. No additional text, no explanations, just pure JSON.

Extract the following information:
- Deadlines: Any time-sensitive requirements or due dates
- Responsibilities: Who is responsible for what tasks
- Payment terms: How and when payments are made
- Penalties: Consequences for non-compliance or breach
- Confidentiality: Any confidentiality or non-disclosure requirements
- Termination conditions: How the contract can be ended

Also assign a risk level: Low / Medium / High based on:
- Vague or unclear language
- Unclear penalties or consequences
- Missing important sections
- Unbalanced terms
- Unusual or risky provisions

Respond with ONLY this exact JSON format (no other text):
{
  "extracted_clauses": {
    "deadlines": "extracted deadline information",
    "responsibilities": "extracted responsibility information",
    "payment_terms": "extracted payment information",
    "penalties": "extracted penalty information",
    "confidentiality": "extracted confidentiality information",
    "termination_conditions": "extracted termination information"
  },
  "summary": "brief summary of the contract",
  "risk_level": "Low"
}

Contract text:
"""${contractText}"""
`;

  return prompt;
};

// Step 2: Analyze contract with OpenAI
export const analyzeContractWithOpenAI = async (contractText: string, language: 'en' | 'ar' = 'en'): Promise<ContractAnalysis> => {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Sending contract to OpenAI for analysis... (Attempt ${attempt}/${maxRetries})`);
      
      const prompt = createPrompt(contractText, language);
      
      const response = await axios.post(
        OPENAI_API_URL,
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2000
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000 // 30 second timeout
        }
      );

      const gptReply = response.data.choices[0].message.content;
      console.log('OpenAI response received:', gptReply);
      
      // Parse the JSON response with better error handling
      try {
        // Clean the response - remove any markdown formatting
        let cleanedResponse = gptReply.trim();
        
        // Remove markdown code blocks if present
        if (cleanedResponse.startsWith('```json')) {
          cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedResponse.startsWith('```')) {
          cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        console.log('Cleaned response:', cleanedResponse);
        
        const analysis = JSON.parse(cleanedResponse);
        
        // Validate the response structure
        if (!analysis.extracted_clauses || !analysis.summary || !analysis.risk_level) {
          console.warn('Invalid response structure from OpenAI, providing fallback');
          return {
            extracted_clauses: {
              deadlines: 'No specific deadlines found',
              responsibilities: 'No specific responsibilities found',
              payment_terms: 'No payment terms found',
              penalties: 'No penalties found',
              confidentiality: 'No confidentiality clauses found',
              termination_conditions: 'No termination conditions found'
            },
            summary: analysis.summary || 'Unable to generate summary',
            risk_level: analysis.risk_level || 'Medium'
          } as ContractAnalysis;
        }
        
        // Ensure all clause properties exist to prevent undefined errors
        const safeAnalysis = {
          extracted_clauses: {
            deadlines: analysis.extracted_clauses.deadlines || 'No specific deadlines found',
            responsibilities: analysis.extracted_clauses.responsibilities || 'No specific responsibilities found',
            payment_terms: analysis.extracted_clauses.payment_terms || 'No payment terms found',
            penalties: analysis.extracted_clauses.penalties || 'No penalties found',
            confidentiality: analysis.extracted_clauses.confidentiality || 'No confidentiality clauses found',
            termination_conditions: analysis.extracted_clauses.termination_conditions || 'No termination conditions found'
          },
          summary: analysis.summary,
          risk_level: analysis.risk_level
        };
        
        return safeAnalysis as ContractAnalysis;
      } catch (parseError) {
        console.error('Failed to parse OpenAI response as JSON:', parseError);
        console.error('Raw response was:', gptReply);
        
        // Try to extract JSON from the response if it contains other text
        try {
          const jsonMatch = gptReply.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const extractedJson = jsonMatch[0];
            console.log('Extracted JSON:', extractedJson);
            const analysis = JSON.parse(extractedJson);
            return analysis as ContractAnalysis;
          }
        } catch (extractError) {
          console.error('Failed to extract JSON from response:', extractError);
        }
        
        // Provide a fallback response when parsing completely fails
        console.warn('Providing fallback response due to parsing failure');
        return {
          extracted_clauses: {
            deadlines: 'Unable to extract deadlines - document may not be a contract',
            responsibilities: 'Unable to extract responsibilities - document may not be a contract',
            payment_terms: 'Unable to extract payment terms - document may not be a contract',
            penalties: 'Unable to extract penalties - document may not be a contract',
            confidentiality: 'Unable to extract confidentiality clauses - document may not be a contract',
            termination_conditions: 'Unable to extract termination conditions - document may not be a contract'
          },
          summary: 'Unable to analyze this document. It may not be a contract or the text is unclear.',
          risk_level: 'Medium'
        } as ContractAnalysis;
      }
    } catch (error: any) {
      console.error(`OpenAI analysis failed (Attempt ${attempt}/${maxRetries}):`, error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      // Check if this is a retryable error
      const isRetryableError = 
        error.response?.status === 503 || // Service Unavailable
        error.response?.status === 502 || // Bad Gateway
        error.response?.status === 500 || // Internal Server Error
        error.response?.status === 429 || // Rate Limit (with exponential backoff)
        error.code === 'ECONNABORTED' || // Timeout
        error.code === 'ENOTFOUND' || // Network error
        error.code === 'ECONNRESET'; // Connection reset
      
      if (isRetryableError && attempt < maxRetries) {
        console.log(`Retrying in ${retryDelay}ms... (${maxRetries - attempt} attempts remaining)`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue; // Try again
      }
      
      // If it's the last attempt or a non-retryable error, throw the error
      if (error.response?.status === 401) {
        throw new Error('OpenAI API key is invalid or missing');
      } else if (error.response?.status === 404) {
        throw new Error('OpenAI API endpoint not found - check model name');
      } else if (error.response?.status === 503) {
        throw new Error('OpenAI service is temporarily unavailable. Please try again later.');
      } else if (error.response?.status === 502) {
        throw new Error('OpenAI service is experiencing issues. Please try again later.');
      } else if (error.response?.status === 500) {
        throw new Error('OpenAI service encountered an internal error. Please try again later.');
      } else if (error.response?.status === 429) {
        throw new Error('OpenAI API rate limit exceeded. Please wait a moment and try again.');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('OpenAI API request timed out. Please check your connection and try again.');
      } else {
        throw new Error(`OpenAI analysis failed: ${error.message}`);
      }
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw new Error('All retry attempts failed');
};

// Step 3: Save analysis results to Firestore
export const saveAnalysisToFirestore = async (docId: string, analysis: MultilingualAnalysis): Promise<void> => {
  try {
    console.log('Saving analysis to Firestore...');
    const docRef = doc(db, 'extractedTexts', docId);
    await updateDoc(docRef, {
      extracted_clauses: analysis,
      status: 'analyzed',
      analyzedAt: new Date()
    });
    console.log('Analysis saved to Firestore successfully');
  } catch (error: any) {
    console.error('Failed to save analysis to Firestore:', error);
    throw new Error(`Failed to save analysis: ${error.message}`);
  }
};

// Step 4: Get contract text from Firestore
export const getContractText = async (docId: string): Promise<string> => {
  try {
    const docRef = doc(db, 'extractedTexts', docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.extractedText || '';
    } else {
      throw new Error('Document not found');
    }
  } catch (error: any) {
    console.error('Failed to get contract text:', error);
    throw new Error(`Failed to get contract text: ${error.message}`);
  }
};

// Step 5: Complete analysis flow
export const runClauseExtraction = async (docId: string, language: 'en' | 'ar' = 'en'): Promise<MultilingualAnalysis> => {
  try {
    // Get the contract text from Firestore
    const contractText = await getContractText(docId);
    if (!contractText) {
      throw new Error('No contract text found for analysis');
    }
    
    // Check if we already have analysis for this document
    const docRef = doc(db, 'extractedTexts', docId);
    const docSnap = await getDoc(docRef);
    let existingAnalysis: MultilingualAnalysis = {};
    
    if (docSnap.exists() && docSnap.data().extracted_clauses) {
      existingAnalysis = docSnap.data().extracted_clauses as MultilingualAnalysis;
    }
    
    // Only analyze if we don't have this language already
    if (existingAnalysis[language]) {
      return existingAnalysis;
    }
    
    // Create the prompt for the specific language
    const prompt = createPrompt(contractText, language);
    
    // Send to OpenAI for analysis
    const analysis = await analyzeContractWithOpenAI(contractText, language);
    
    // Merge with existing analysis
    const updatedAnalysis = {
      ...existingAnalysis,
      [language]: analysis
    };
    
    // Save the analysis results to Firestore
    await saveAnalysisToFirestore(docId, updatedAnalysis);
    
    return updatedAnalysis;
  } catch (error: any) {
    console.error('Error in contract analysis:', error);
    throw error;
  }
};

// New function to analyze contract text directly
export const analyzeContractText = async (contractText: string, language: 'en' | 'ar' = 'en'): Promise<ContractAnalysis> => {
  try {
    if (!contractText || contractText.trim().length === 0) {
      throw new Error('No contract text provided for analysis');
    }
    
    // Send to OpenAI for analysis
    const analysis = await analyzeContractWithOpenAI(contractText, language);
    
    return analysis;
  } catch (error: any) {
    console.error('Error in direct contract analysis:', error);
    throw error;
  }
}; 

// Function to update contract with parsed deadline
export const updateContractWithDeadline = async (contractId: string, deadlineText: string): Promise<void> => {
  try {
    // Parse the deadline text to get actual date
    const parsedDeadline = await parseDeadlineFromText(deadlineText);
    
    if (parsedDeadline) {
      // Convert to Firestore Timestamp
      const deadlineTimestamp = Timestamp.fromDate(parsedDeadline);
      
      // Update the contract document with the deadline
      const contractRef = doc(db, 'contracts', contractId);
      await updateDoc(contractRef, {
        deadline: deadlineTimestamp,
        updatedAt: Timestamp.now()
      });
    }
  } catch (error: any) {
    // Handle network errors gracefully
    if (error?.message?.includes('Network Error') || error?.code === 'NETWORK_ERROR') {
      console.log('Network error while updating contract deadline - skipping');
    } else {
      console.error('Error updating contract with deadline:', error);
    }
  }
};

// Enhanced function to run analysis and update deadline
export const runAnalysisWithDeadlineUpdate = async (docId: string, language: 'en' | 'ar' = 'en'): Promise<MultilingualAnalysis> => {
  try {
    // Get contract text
    const contractText = await getContractText(docId);
    
    // Run analysis
    const analysis = await analyzeContractWithOpenAI(contractText, language);
    
    // Parse and update deadline if found
    if (analysis.extracted_clauses.deadlines) {
      await updateContractWithDeadline(docId, analysis.extracted_clauses.deadlines);
    }
    
    // Save analysis to Firestore
    const multilingualAnalysis: MultilingualAnalysis = {
      [language]: analysis
    };
    await saveAnalysisToFirestore(docId, multilingualAnalysis);
    
    return multilingualAnalysis;
  } catch (error) {
    console.error('Error in runAnalysisWithDeadlineUpdate:', error);
    throw error;
  }
}; 
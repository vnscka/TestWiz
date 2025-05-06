import express from 'express';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import dotenv from 'dotenv';
import cors from 'cors';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import vision from '@google-cloud/vision';
import FormData from 'form-data';

const saltRounds = 10;
dotenv.config();

const jwtSecret = process.env.JWT_SECRET;
const encryptionKeyHex = process.env.ENCRYPTION_KEY;
const ivHex = process.env.ENCRYPTION_IV;
const visionClient = new vision.ImageAnnotatorClient();

if (!jwtSecret || !encryptionKeyHex || !ivHex) {
    console.error("FATAL ERROR: Missing JWT_SECRET, ENCRYPTION_KEY, or ENCRYPTION_IV in .env file.");
    console.error("Please ensure these are set correctly with appropriate lengths:");
    console.error("- JWT_SECRET: any strong random string.");
    console.error("- ENCRYPTION_KEY: 64 hex characters (32 bytes).");
    console.error("- ENCRYPTION_IV: 32 hex characters (16 bytes).");
    process.exit(1);
}

const encryptionKey = Buffer.from(encryptionKeyHex, 'hex');
const iv = Buffer.from(ivHex, 'hex');

const algorithm = 'aes-256-cbc';
if (encryptionKey.length !== 32) {
    console.error(`FATAL ERROR: ENCRYPTION_KEY is not 32 bytes long after hex decoding. It is ${encryptionKey.length} bytes. Ensure it's 64 hex characters for AES-256.`);
    process.exit(1);
}
if (iv.length !== 16) {
    console.error(`FATAL ERROR: ENCRYPTION_IV is not 16 bytes long after hex decoding. It is ${iv.length} bytes. Ensure it's 32 hex characters for AES-256-CBC.`);
    process.exit(1);
}

const app = express();
const port = process.env.BACKEND_PORT || 3001;

const corsOptions = {
    origin: 'http://localhost:8080',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) {
        console.warn("Authentication failed: No token provided.");
        return res.sendStatus(401);
    }

        // Verify the token using the secret key
        jwt.verify(token, jwtSecret, (err, user) => {
            // If verification fails (invalid signature, expired, etc.)
            if (err) {
                console.warn("Authentication failed: Invalid token.", err.message);
                // 403 Forbidden: The server understood the request but refuses to authorize it (invalid token)
                return res.sendStatus(403);
            }

            // If token is valid, the 'user' payload from the token ({ id, username }) is available
            // Attach this user information to the request object so subsequent handlers can access it
            req.user = user; // Standard practice is to attach to req.user or req.auth

            console.log(`Token authenticated successfully for user ID: ${user.id}`);

            // Call next() to pass the request to the next middleware or the final route handler
            next();
        });
    };

    // Database setup
    const db = new sqlite3.Database('./database.sqlite', (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to the SQLite database.');

        // Enable foreign key support (recommended for integrity)
        db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
            if(pragmaErr) console.error("Error enabling foreign keys:", pragmaErr.message);
        });

    //Users table: Stores user accounts
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP -- Timestamp of creation
    )`, (createErr) => {
        if(createErr) console.error("Error creating users table:", createErr.message);
    });

    //api_keys table: Stores encrypted API keys linked to users
    db.run(`CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL, -- Link to users table, enforce one key per user
        encrypted_key TEXT NOT NULL, -- Encrypted API key
        api_type TEXT NOT NULL DEFAULT 'Gemini', -- e.g., 'Gemini', 'OpenAI'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE -- Delete key if user is deleted
    )`, (createErr) => {
        if(createErr) console.error("Error creating api_keys table:", createErr.message);
    });

    //quizzes table: Stores generated quiz data linked to users
    db.run(`CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY, -- Use TEXT for UUIDs as primary key
        user_id INTEGER NOT NULL, -- Link to user (NOT NULL as quiz must belong to a user)
        quiz_type TEXT, -- e.g., 'MCQ', 'FIB', 'Descriptive', 'Combined'
        "class" TEXT, -- Quoted because CLASS is a SQL keyword
        curriculum TEXT,
        subject TEXT,
        chapters TEXT,
        questions TEXT, -- Store questions array as JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE -- Delete quizzes if user is deleted
    )`, (createErr) => {
            if(createErr) console.error("Error creating quizzes table:", createErr.message);
    });

    //results table: Stores quiz submission results linked to users and quizzes
    db.run(`CREATE TABLE IF NOT EXISTS results (
        id TEXT PRIMARY KEY, -- UUID for the result entry
        user_id INTEGER NOT NULL, -- Link to user (NOT NULL as result must belong to user)
        quiz_id TEXT NOT NULL, -- Link to the quiz taken (NOT NULL)
        score REAL, -- Overall score (e.g., percentage)
        feedback TEXT, -- Store feedback/evaluation results as JSON string
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE, -- Link to users table
        FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE -- Link to quizzes table
    )`, (createErr) => {
            if(createErr) console.error("Error creating results table:", createErr.message);
    });
      }
    });

    // Close the database connection when the Node process exits
    process.on('SIGINT', () => {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed.');
            }
            process.exit(0); // Exit the process after closing the database
        });
    });

    // --- Multer Setup for File Uploads --
    // Use process.cwd() to get the directory where the script is run from,
    // which is usually the backend directory. This is safer than __dirname in some module systems.
    const uploadsDir = path.join(process.cwd(), 'uploads');

    // Check if uploads directory exists, create it if not
    if (!fs.existsSync(uploadsDir)) {
        try {
            fs.mkdirSync(uploadsDir, { recursive: true });
            console.log(`Created uploads directory at ${uploadsDir}`);
        } catch (mkdirErr) {
            console.error(`FATAL ERROR: Failed to create uploads directory at ${uploadsDir}:`, mkdirErr.message);
            process.exit(1); // Exit if we cannot create the uploads directory
        }
    }

    // Define storage for uploaded files
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
          // The path must be an absolute path or relative to the project root where you run node
          cb(null, uploadsDir); // Save files in the 'uploads' folder
        },
        filename: function (req, file, cb) {
          // Define how files should be named
          // Using a timestamp ensures unique filenames and prevents overwrites
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const fileExtension = file.originalname.split('.').pop(); // Get the original file extension
          cb(null, `${file.fieldname}-${uniqueSuffix}.${fileExtension}`); // e.g., pdfFile-1678888888888-123456789.pdf
        }
      });
      
      // Create the Multer upload instance
      // 'upload' is now middleware that can be used in routes
      const upload = multer({ storage: storage });
      // --- End Multer Setup ---

    // --- Helper function to decrypt API key ---
    const decryptApiKey = (encryptedKeyHex, encryptionKey, iv) => {
        try {
            const encryptedKeyBuffer = Buffer.from(encryptedKeyHex, 'hex');
            const decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
            let decrypted = decipher.update(encryptedKeyBuffer, 'hex', 'utf8'); // Use 'hex' for input
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.error("Error decrypting API key:", error.message);
            // Depending on severity, you might throw or return null/undefined
            throw new Error("Failed to decrypt API key."); // Throwing is often better for critical errors
        }
    };

    // --- Helper function to generate quiz using AI (adapted from your code) ---
    // This function remains largely the same as the AI generation logic was separate from submission/evaluation
    async function generateQuizWithAI(apiKey, apiType, quiz_type, class_name, curriculum, subject, chapters, num_questions) {
        // Construct the prompt for the AI based on the requirements
        const prompt = `
        Generate a ${quiz_type} quiz for ${class_name} class following ${curriculum} curriculum on ${subject},
        covering chapters: ${chapters}. Include exactly ${num_questions} questions.

        Format the response as a JSON object with the following structure:
        {
            "questions": [
                {
                    "id": "unique_question_id_string", // Use a unique string ID for each question
                    "question": "Question text here.",
                    "type": "${quiz_type}", // e.g., "MCQ", "FIB", "Descriptive"
                    ${quiz_type === 'MCQ' ? `"options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"],` : ''} // Include options array only for MCQ
                    "answer": "Correct answer text here (e.g., 'C', 'Ampere', or detailed answer for Descriptive).",
                    "explanation": "Brief explanation of the answer."
                }
                // ... exactly ${num_questions} more question objects
            ]
        }
        Provide ONLY the JSON object. Do not include any introductory or concluding text, markdown code blocks (like \`\`\`json\`), or extra characters outside the JSON. Ensure the JSON is valid and complete and contains exactly ${num_questions} questions.
        `;

        console.log("Sending prompt to AI for quiz generation:", prompt);

        try {
            let rawResponseText = '';

            if (apiType === 'OpenAI') {
                console.log("Calling OpenAI API for quiz generation...");
                const openai = new OpenAI({ apiKey: apiKey });
                // Use chat.completions for text generation tasks
                const completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo", // Recommend a cost-effective model for generation
                    messages: [{"role": "user", "content": prompt}],
                    temperature: 0.7, // Adjust temperature (0-1) for creativity vs accuracy
                    // Use response_format to encourage JSON output (supported by newer models)
                    response_format: { type: "json_object" },
                });
                rawResponseText = completion.choices[0].message.content;

            } else if (apiType === 'Gemini') {
                 console.log("Calling Gemini API for quiz generation...");
                 const genAI = new GoogleGenerativeAI(apiKey);
                 // Use a model capable of following instructions and outputting JSON
                 const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }); // Example model with large context window

                 // Use generateContent for multi-turn or complex prompts
                 const result = await model.generateContent(prompt);
                 const response = await result.response;
                 rawResponseText = response.text(); // Get the text response from Gemini

            } else {
                // Should not happen if apiType is validated on set-api-key
                throw new Error('Invalid API type specified for quiz generation.');
            }

            console.log("Raw AI Response for quiz generation:", rawResponseText);

            // Attempt to parse the raw response text as JSON
            let quizData;
            try {
                         // Clean up potential markdown fences (```json ... ```) if AI includes them despite instruction
                 let cleanedResponseText = rawResponseText.trim();
            if (cleanedResponseText.startsWith('```json')) {
                cleanedResponseText = cleanedResponseText.substring('```json'.length).trim();
            } else if (cleanedResponseText.startsWith('```')) {
                cleanedResponseText = cleanedResponseText.substring('```'.length).trim();
            }
            if (cleanedResponseText.endsWith('```')) {
                cleanedResponseText = cleanedResponseText.substring(0, cleanedResponseText.length - '```'.length).trim();
            }

            quizData = JSON.parse(cleanedResponseText); // Parse the cleaned text into a JavaScript object

                 // Basic validation: ensure 'questions' array exists and has items
                 if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
                     console.error("AI response missing expected 'questions' array or it's empty.");
                     console.error("Faulty response:", rawResponseText);
                     throw new Error("AI failed to generate questions in the expected format. Received: " + rawResponseText);
                 }
    console.log("Cleaning generated quiz data before saving...");
    const cleanText = (text) => {
        if (typeof text !== 'string') return text; // Return non-strings as is
        // Replace newline characters with a space
        let cleaned = text.replace(/[\n\r]/g, ' ');
        // Replace specific non-standard spaces/separators and collapse remaining whitespace
        cleaned = cleaned.replace(/[\u00A0\u200B-\u200F\u2028\u2029\uFEFF]/g, ' ');
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        // --- Add this line to remove common ASCII control characters (0x00 to 0x1F and 0x7F) ---
        cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
        // --- End of new line ---
        return cleaned;
    };
            quizData.questions = quizData.questions.map(q => {
                // Apply enhanced cleaning to all relevant string fields
                const cleanedQuestion = cleanText(q.question);
                const cleanedAnswer = cleanText(q.answer);
                const cleanedExplanation = cleanText(q.explanation);
                const cleanedOptions = Array.isArray(q.options) ? q.options.map(opt => cleanText(opt)) : (q.options || undefined);

                return {
                    ...q, // Keep other properties like 'id', 'type'
                    question: cleanedQuestion,
                    answer: cleanedAnswer,
                    explanation: cleanedExplanation,
                    ...(cleanedOptions !== undefined && { options: cleanedOptions }) // Include options only if it existed
                };
            });
            console.log("Data cleaning complete.");
            // --- END ADD THIS ENHANCED DATA CLEANING STEP ---

                 // Assign unique IDs if not provided by AI (or regenerate them to be safe)
                 // Frontend often works better with stable unique IDs
                 quizData.questions = quizData.questions.map((q, index) => ({
                     ...q,
                     // Ensure question 'id' is a string
                     id: q.id ? String(q.id) : uuidv4() // Use AI's ID if present, otherwise generate UUID
                 }));


            } catch (jsonError) {
                 console.error("JSON Parsing or Validation Error during quiz generation:", jsonError);
                 console.error("Faulty raw response:", rawResponseText);
                 throw new Error(`Failed to process AI response: ${jsonError.message}. Raw response starts with: "${rawResponseText.substring(0, Math.min(rawResponseText.length, 100))}..."`);
            }

            // Return the parsed and validated quiz data
            return quizData;

        } catch (apiError) {
            // Handle errors during the AI API call itself (network issues, invalid key, etc.)
            console.error('Error during AI quiz generation call:', apiError);
            let errorMessage = 'Error communicating with the AI during quiz generation.';
            // Attempt to extract a more specific error message from the AI provider's error object
            if (apiError.message) {
                 errorMessage = `AI API Error: ${apiError.message}`;
            }
             // Check for common API key related errors in the message
             if (errorMessage.includes('Invalid API Key') || errorMessage.includes('authentication_error') || errorMessage.includes('API key not valid')) {
                errorMessage = 'Invalid or expired API key. Please set your API key again.';
             }
            throw new Error(errorMessage); // Rethrow with a simpler, user-friendly message
        }
    }

// --- Helper function to evaluate a single descriptive answer using AI ---
// MODIFIED: Improved prompt structure to combine typed and PDF text for AI evaluation
async function evaluateDescriptiveAnswer(apiKey, apiType, question, typedAnswer, pdfText = '') {
    console.log("Inside evaluateDescriptiveAnswer, received apiType:", apiType);
    console.log("Typed Answer length for evaluation:", typedAnswer.length);
    console.log("PDF Text length for evaluation:", pdfText.length);
    
    const studentProvidedAnswer = `---
    Typed Answer: ${typedAnswer.trim() || 'No typed answer provided.'}
    Extracted from PDF: ${pdfText.trim() || 'No text extracted or uploaded.'}
    ---`;

    // Construct the prompt for AI evaluation
    const prompt = `
        Evaluate the following user answer for the question below.
        ${pdfText ? `Consider the following reference text from a PDF:\n---\n${pdfText}\n---\n` : ''}
        Question: ${question.question}
        Correct Answer/Key Points: ${question.answer} ${question.explanation ? `(Explanation: ${question.explanation})` : ''}
        Student Provided Answer: ${studentProvidedAnswer}
        
        Provide a score out of 10 based on accuracy and completeness compared to the correct answer, using the reference text if provided and relevant.
        Provide concise feedback, identify correct parts, and suggest areas for improvement.
        Format your response as a JSON object with the following keys:
        {
          "score": number (integer 0-10),
          "feedback": string,
          "correct_parts": string (or "N/A"),
          "improvements": string (or "N/A")
        }
        Provide ONLY the JSON object. Do not include any introductory or concluding text, markdown code blocks (like \`\`\`json\`), or extra characters outside the JSON. Ensure the JSON is valid.
        `;


        console.log("Sending descriptive evaluation prompt to AI (first 500 chars):", prompt.substring(0, Math.min(prompt.length, 500)) + (prompt.length > 500 ? '...' : ''));


        try {
            let rawResponseText = '';

            if (apiType === 'OpenAI') {
                console.log("Calling OpenAI API for descriptive evaluation...");
                const openai = new OpenAI({ apiKey: apiKey });
                const completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo", // gpt-4 or gpt-4o might be better for evaluation but cost more
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.3, // Lower temperature for less creativity, more focused evaluation
                    response_format: { type: "json_object" }, // Request JSON object format
                });
                rawResponseText = completion.choices[0].message.content;

            } else if (apiType === 'Gemini') {
                console.log("Calling Gemini API for descriptive evaluation...");
                const genAI = new GoogleGenerativeAI(apiKey);
                // Use a model capable of processing long text if pdfText is large
                // gemini-1.5-pro-latest has a large context window
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

                const result = await model.generateContent(prompt);
                const response = await result.response;
                rawResponseText = response.text(); // Get the text response from Gemini

            } else {
                throw new Error('Invalid API type specified for evaluation.');
            }

            console.log("Raw AI Response for evaluation:", rawResponseText);

            // Attempt to parse the raw response text as JSON
            let evaluationData;
            try {
                // Clean up potential markdown formatting (```json ... ```)
                let cleanedResponseText = rawResponseText.trim();
                if (cleanedResponseText.startsWith('```json')) {
                    cleanedResponseText = cleanedResponseText.substring('```json'.length).trim();
                } else if (cleanedResponseText.startsWith('```')) { // Handle fences without language specifier
                    cleanedResponseText = cleanedResponseText.substring('```'.length).trim();
                }
                if (cleanedResponseText.endsWith('```')) {
                    cleanedResponseText = cleanedResponseText.substring(0, cleanedResponseText.length - 3).trim();
                }

                evaluationData = JSON.parse(cleanedResponseText); // Parse the cleaned text

                // Validate structure - ensure required keys exist and have expected types
                if (
                    !evaluationData ||
                    typeof evaluationData.score !== 'number' ||
                    typeof evaluationData.feedback !== 'string' ||
                    // Check optional keys exist and are strings, or add default if missing
                    typeof evaluationData.correct_parts !== 'string' ||
                    typeof evaluationData.improvements !== 'string'
                ) {
                    console.error("AI evaluation response missing expected keys, wrong types, or format.");
                    console.error("Faulty response:", rawResponseText);
                    // Attempt to construct a minimal valid object if parsing succeeded partially
                    evaluationData = {
                        score: typeof evaluationData?.score === 'number' ? evaluationData.score : 0,
                        feedback: typeof evaluationData?.feedback === 'string' ? `Partial evaluation: ${evaluationData.feedback}` : 'Failed to parse full AI evaluation.',
                        correct_parts: typeof evaluationData?.correct_parts === 'string' ? evaluationData.correct_parts : 'N/A',
                        improvements: typeof evaluationData?.improvements === 'string' ? evaluationData.improvements : 'N/A',
                    };
                    console.warn("Returning partial evaluation data due to validation failure.");
                    // Don't throw error here, return partial data for display
                } else {
                    // Ensure score is within 0-10 if it was successfully parsed as a number
                    evaluationData.score = Math.max(0, Math.min(10, evaluationData.score));
                }


            } catch (jsonError) {
                console.error("JSON Parsing Error during evaluation:", jsonError);
                console.error("Faulty raw response:", rawResponseText);
                // Return a default error evaluation result if JSON parsing completely fails
                evaluationData = {
                    score: 0,
                    feedback: `Automated evaluation failed: Could not parse AI response. Raw response starts with: "${rawResponseText.substring(0, Math.min(rawResponseText.length, 100))}..."`,
                    correct_parts: 'N/A',
                    improvements: 'N/A',
                };
                console.warn("Returning error evaluation data due to JSON parsing failure.");
                // Don't throw error here, return the error data
            }

            // Return parsed and validated (or error) evaluation data
            return evaluationData;

        } catch (apiError) {
            console.error('Error during AI evaluation call:', apiError);
            let errorMessage = 'Error communicating with the AI during evaluation.';

            if (apiError.message) {
                errorMessage = `AI API Error: ${apiError.message}`;
            }

            // Check for common authentication errors
            if (
                errorMessage.includes('Invalid API Key') ||
                errorMessage.includes('authentication_error') ||
                errorMessage.includes('API key not valid')
            ) {
                errorMessage = 'Invalid or expired API key. Please set your API key again.';
            }

            // Instead of throwing here, return an error evaluation object
            return {
                score: 0,
                feedback: `Automated evaluation failed: ${errorMessage}`,
                correct_parts: 'N/A',
                improvements: 'N/A',
            };
        }
    }


/*
 * API Endpoints
 */

// Endpoint for User Registration (Public Route - No Auth Needed)
app.post('/register', (req, res) => {
    const { username, password } = req.body;

    console.log(`Received registration request for username: ${username}`);

    // Basic validation
    if (!username || !password) {
        console.error("Registration failed: Missing username or password.");
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Hash the password
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            console.error('Bcrypt hashing error during registration:', err.message);
            return res.status(500).json({ error: 'Error processing password.' });
        }

        // Insert the new user into the database
        db.run(`INSERT INTO users (username, password_hash) VALUES (?, ?)`,
            [username, hash],
            function(insertErr) { // Use function keyword to access 'this'
                if (insertErr) {
                    // Check if the error is due to a unique constraint violation (username already exists)
                    if (insertErr.message.includes('UNIQUE constraint failed')) {
                        console.warn(`Registration failed: Username already exists: ${username}`);
                        return res.status(409).json({ error: 'Username already exists.' }); // 409 Conflict
                    } else {
                         console.error('Database error during registration:', insertErr.message);
                         return res.status(500).json({ error: 'Failed to register user.' });
                    }
                }

                // Registration successful
                console.log(`User registered successfully with ID: ${this.lastID}`); // Access last inserted ID
                // Optional: Log the user in automatically after registration? Or require them to login.
                // For now, just return success message. Frontend will redirect to login.
                res.status(201).json({ message: 'User registered successfully!' }); // 201 Created
            });
    });
});


// Endpoint for User Login (Public Route - No Auth Needed)
// Issues a JWT upon successful authentication
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    console.log(`Received login request for username: ${username}`);

    // Basic validation
    if (!username || !password) {
        console.error("Login failed: Missing username or password.");
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Find the user in the database by username
    db.get(`SELECT id, username, password_hash FROM users WHERE username = ?`, [username], (err, row) => {
        if (err) {
            console.error('Database error during login:', err.message);
            return res.status(500).json({ error: 'Error retrieving user.' });
        }

        // Check if user exists
        if (!row) {
            console.warn(`Login failed: User not found for username: ${username}`);
            return res.status(401).json({ error: 'Invalid credentials.' }); // 401 Unauthorized
        }

        const user = row;

        // Compare the provided password with the stored hash
        bcrypt.compare(password, user.password_hash, (compareErr, result) => {
            if (compareErr) {
                console.error('Bcrypt comparison error during login:', compareErr.message);
                 return res.status(500).json({ error: 'Error verifying password.' });
            }

            if (result) {
                // Passwords match - Login Successful!
                console.log(`User logged in successfully: ${user.username} (ID: ${user.id})`);

                // --- Generate and send a JWT ---
                const token = jwt.sign(
                    { id: user.id, username: user.username }, // Payload: information to include in the token
                    jwtSecret, // Your secret key from .env (make sure it's defined and accessible)
                    { expiresIn: '24h' } // Token expiration time (e.g., 1 hour)
                );
                 // --- End Generate JWT ---

                // Send back the token and basic user info to the frontend
                res.status(200).json({
                    message: 'Login successful!',
                    token: token, // Send the generated JWT
                    user: { id: user.id, username: user.username } // Send back basic user info
                });

            } else {
                // Passwords do not match
                console.warn(`Login failed: Incorrect password for username: ${username}`);
                return res.status(401).json({ error: 'Invalid credentials.' }); // 401 Unauthorized
            }
        });
    });
});


// Protected Route: Set API key and type
app.post('/set-api-key', authenticateToken, (req, res) => {
        const userId = req.user.id; // Get user ID from authenticated token payload
        const { apiKey, apiType } = req.body;
        console.log(`User ${userId}: Received request to set API key.`);
    
        if (!apiKey) {
            return res.status(400).json({ error: 'API key is required.' });
        }
        if (!apiType || (apiType !== 'Gemini' && apiType !== 'OpenAI')) {
            return res.status(400).json({ error: 'Valid API type (Gemini or OpenAI) is required.' });
        }
    
      try {
        // Ensure algorithm, encryptionKey, iv are accessible
        const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
        let encrypted = cipher.update(apiKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
    
        // Use INSERT OR REPLACE to handle both inserting a new key or updating an existing one for the user
        db.run(
          `INSERT OR REPLACE INTO api_keys (user_id, encrypted_key, api_type) VALUES (?, ?, ?)`,
          [userId, encrypted, apiType],
          function(err) { // Use function keyword to access 'this' if needed (not strictly needed here)
            if (err) {
              console.error(`User ${userId}: Error saving API key to database:`, err.message);
              return res.status(500).json({ error: 'Failed to save API key.' });
            }
            console.log(`User ${userId}: API key and type saved/updated.`);
            res.status(200).json({ success: true, message: 'API key and type saved successfully.' });
          }
        );
      } catch (error) {
        console.error(`User ${userId}: Encryption or database error during set-api-key:`, error);
        res.status(500).json({ error: 'Internal server error during key processing.' });
      }
    });


    // Protected Route: Generate a General Quiz (MCQ/FIB)
    app.post('/generate-quiz', authenticateToken, async (req, res) => {
        console.log("Received request to /generate-quiz");
        const userId = req.user.id;

        // Extract quiz parameters from the request body
        const { quiz_type, class: class_name, curriculum, subject, chapters, num_questions } = req.body;
        console.log(`User ${userId}: Quiz Parameters Received:`, { quiz_type, class_name, curriculum, subject, chapters, num_questions });

        // Basic validation
        if (!quiz_type || !class_name || !curriculum || !subject || !chapters || num_questions === undefined) {
            console.error(`User ${userId}: Missing required quiz parameters.`);
            return res.status(400).json({ error: 'Missing required quiz parameters.' });
        }

        // Validate number of questions
        const numberOfQuestions = parseInt(num_questions, 10);
        if (isNaN(numberOfQuestions) || numberOfQuestions <= 0 || numberOfQuestions > 20) { // Limit question count
             console.error(`User ${userId}: Invalid number of questions:`, num_questions);
             return res.status(400).json({ error: 'Number of questions must be a positive number between 1 and 20.' });
        }

        // Retrieve API key and type for the authenticated user
        db.get(`SELECT encrypted_key, api_type FROM api_keys WHERE user_id = ?`, [userId], async (err, row) => {
            if (err) {
                console.error(`User ${userId}: Database error retrieving API key for quiz generation:`, err.message);
                return res.status(500).json({ error: 'Failed to retrieve AI connection details.' });
            }
            if (!row) {
                console.warn(`User ${userId}: API key not found for quiz generation.`);
                return res.status(404).json({ error: 'AI connection details not found for your account. Please set your API key first.' });
            }
            const { encrypted_key, api_type } = row;

            try {
                // Decrypt the API key using the helper function
                const apiKey = decryptApiKey(encrypted_key, encryptionKey, iv);
                console.log(`User ${userId}: API Key retrieved. Type:`, api_type);

                // Call the AI helper function to generate quiz data
                const quizData = await generateQuizWithAI(
                    apiKey, api_type, quiz_type, class_name, curriculum, subject, chapters, numberOfQuestions
                );
                console.log(`User ${userId}: AI successfully generated quiz data.`);

                // Generate a unique ID for the new quiz
                const quizId = uuidv4();

                // Save the generated quiz data to the database, linking it to the user
                const insertSql = 'INSERT INTO quizzes (id, user_id, quiz_type, "class", curriculum, subject, chapters, questions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
                const insertParams = [quizId, userId, quiz_type, class_name, curriculum, subject, chapters, JSON.stringify(quizData)];

                console.log(`User ${userId}: Executing SQL (Quiz Insert): ${insertSql}`);
                console.log(`User ${userId}: With parameters (Quiz Insert):`, insertParams);

                db.run(insertSql, insertParams,
                       function(saveErr) { // Use function keyword for 'this' context (if needed)
                    if (saveErr) {
                        console.error(`User ${userId}: Error saving generated quiz to database:`, saveErr.message);
                        return res.status(500).json({ error: 'Failed to save generated quiz.' });
                    }
                    console.log(`User ${userId}: Quiz saved with ID: ${quizId}`);
                    // Send the new quiz ID back to the frontend
                    res.status(200).json({ success: true, quizId: quizId });
                });

            } catch (error) {
                console.error(`User ${userId}: Error during quiz generation or AI call:`, error.message);
                // Send the error message from the helper function
                res.status(500).json({ error: error.message || 'An error occurred during quiz generation.' });
            }
        });
    });


/// Protected Route: Generate a Descriptive Quiz
app.post('/descriptive-quiz', authenticateToken, async (req, res) => {
    console.log("Received request to /descriptive-quiz");
    const userId = req.user.id;

    // 1. Extract and validate parameters
    let { class: class_name, curriculum, subject, chapters, num_questions } = req.body;

    // Parameter validation
    if (!class_name || !curriculum || !subject || !chapters || num_questions === undefined) {
        console.error(`User ${userId}: Missing required parameters`);
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Convert chapters to string if array
    if (Array.isArray(chapters)) {
        chapters = chapters.join(', ');
    }

    // Validate question count
    const numberOfQuestions = parseInt(num_questions, 10);
    if (isNaN(numberOfQuestions) || numberOfQuestions < 1 || numberOfQuestions > 20) {
        return res.status(400).json({ error: 'Invalid question count (1-20)' });
    }

    // 2. Database operations
    try {
        // Get API key
        const row = await new Promise((resolve, reject) => {
            db.get(`SELECT encrypted_key, api_type FROM api_keys WHERE user_id = ?`, 
            [userId], 
            (err, row) => err ? reject(err) : resolve(row));
        });

        if (!row) return res.status(404).json({ error: 'API key not found' });

        // Decrypt API key
        const apiKey = decryptApiKey(row.encrypted_key, encryptionKey, iv);

        // Generate quiz data
        const quizData = await generateQuizWithAI(
            apiKey,
            row.api_type,
            'Descriptive',
            class_name,
            curriculum,
            subject,
            chapters,
            numberOfQuestions
        );

        // Clean and validate questions
        if (!quizData?.questions?.length) {
            throw new Error('AI failed to generate questions');
        }

        // 3. Database insertion
        const quizId = uuidv4();
        const insertSql = `INSERT INTO quizzes (
            id, 
            user_id, 
            quiz_type, 
            "class", 
            curriculum, 
            subject, 
            chapters, 
            questions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        const insertParams = [
            quizId,
            userId,
            'Descriptive',
            class_name,
            curriculum,
            subject,
            chapters,
            JSON.stringify(quizData)
        ];

        // Execute single insert
        await new Promise((resolve, reject) => {
            db.run(insertSql, insertParams, function(err) {
                err ? reject(err) : resolve(this.lastID);
            });
        });

        // Success response
        res.status(200).json({ 
            success: true, 
            quizId,
            message: 'Quiz generated successfully'
        });

    } catch (error) {
        console.error(`Descriptive quiz error: ${error.message}`);
        res.status(500).json({ 
            error: error.message.includes('API key') 
                ? 'Invalid API key' 
                : 'Quiz generation failed'
        });
    }
});

    // Protected Route: Generate a Combined Exam
// Uses authenticateToken middleware and user's API key
app.post('/combined-exam', authenticateToken, async (req, res) => { // Middleware Applied
    console.log("Received request to /combined-exam");
    const userId = req.user.id; // Get user ID from authenticated token payload

    // Extract combined exam parameters
    // Assuming parameters include counts for each question type:
    const {
        class: class_name, curriculum, subject, chapters,
        num_mcq, num_fib, num_descriptive
    } = req.body;

    console.log(`User ${userId}: Combined Exam Parameters Received:`, {
        class_name, curriculum, subject, chapters, num_mcq, num_fib, num_descriptive
    });

    // Basic validation for combined exam counts
     if (!class_name || !curriculum || !subject || !chapters ||
         num_mcq === undefined || num_fib === undefined || num_descriptive === undefined) {
        console.error(`User ${userId}: Missing required combined exam parameters.`);
        return res.status(400).json({ error: 'Missing required combined exam parameters.' });
    }

    // Parse counts and validate total
    const numMCQ = parseInt(num_mcq, 10) || 0; // Default to 0 if not provided or invalid
    const numFIB = parseInt(num_fib, 10) || 0;
    const numDescriptive = parseInt(num_descriptive, 10) || 0;

    const totalQuestions = numMCQ + numFIB + numDescriptive;

     if (totalQuestions <= 0 || totalQuestions > 30) { // Limit max total questions
         console.error(`User ${userId}: Invalid total number of questions:`, totalQuestions);
         return res.status(400).json({ error: 'Total number of questions must be positive and not exceed 30.' });
    }


    // Retrieve API key and type for the authenticated user
    db.get(`SELECT encrypted_key, api_type FROM api_keys WHERE user_id = ?`, [userId], async (err, row) => { // Query by user_id
        if (err) {
            console.error(`User ${userId}: Database error retrieving API key for combined exam generation:`, err.message);
            return res.status(500).json({ error: 'Failed to retrieve AI connection details.' });
        }

        if (!row) {
            console.warn(`User ${userId}: API key not found for combined exam generation.`);
            return res.status(404).json({ error: 'AI connection details not found for your account. Please set your API key first.' }); // 404 Not Found
        }

        const { encrypted_key, api_type } = row;

        try {
            // Decrypt the API key using the helper function
            const apiKey = decryptApiKey(encrypted_key, encryptionKey, iv);
            console.log(`User ${userId}: API Key retrieved for combined exam generation. API Type:`, api_type);

            // --- Call AI sequentially for each question type needed ---
            let allQuestions =[];

            if (numMCQ > 0) {
                 console.log(`User ${userId}: Generating ${numMCQ} MCQ questions...`);
                 try {
                     // Ensure generateQuizWithAI is defined and handles MCQ type
                     const mcqQuizData = await generateQuizWithAI(
                         apiKey, api_type, 'MCQ', class_name, curriculum, subject, chapters, numMCQ
                     );
                     if (mcqQuizData && Array.isArray(mcqQuizData.questions)) {
                         allQuestions = allQuestions.concat(mcqQuizData.questions);
                     } else {
                         console.warn(`User ${userId}: generateQuizWithAI did not return expected MCQ data.`);
                     }
                 } catch (err) {
                      console.error(`User ${userId}: Error generating MCQ questions:`, err.message);
                      // Log and continue with other types, but indicate failure
                 }
            }

             if (numFIB > 0) {
                 console.log(`User ${userId}: Generating ${numFIB} FIB questions...`);
                  try {
                    // Ensure generateQuizWithAI is defined and handles FIB type
                     const fibQuizData = await generateQuizWithAI(
                         apiKey, api_type, 'FIB', class_name, curriculum, subject, chapters, numFIB
                     );
                      if (fibQuizData && Array.isArray(fibQuizData.questions)) {
                         allQuestions = allQuestions.concat(fibQuizData.questions);
                     } else {
                         console.warn(`User ${userId}: generateQuizWithAI did not return expected FIB data.`);
                     }
                 } catch (err) {
                      console.error(`User ${userId}: Error generating FIB questions:`, err.message);
                      // Log and continue
                 }
            }

            if (numDescriptive > 0) {
                 console.log(`User ${userId}: Generating ${numDescriptive} Descriptive questions...`);
                  try {
                    // Ensure generateQuizWithAI is defined and handles Descriptive type
                     const descriptiveQuizData = await generateQuizWithAI(
                         apiKey, api_type, 'Descriptive', class_name, curriculum, subject, chapters, numDescriptive
                     );
                      if (descriptiveQuizData && Array.isArray(descriptiveQuizData.questions)) {
                         allQuestions = allQuestions.concat(descriptiveQuizData.questions);
                     } else {
                         console.warn(`User ${userId}: generateQuizWithAI did not return expected Descriptive data.`);
                     }
                 } catch (err) {
                      console.error(`User ${userId}: Error generating Descriptive questions:`, err.message);
                      // Log and continue
                 }
            }

            // Check if any questions were generated at all
            if (allQuestions.length === 0 && totalQuestions > 0) {
                 console.error(`User ${userId}: AI failed to generate any questions for combined exam.`);
                 return res.status(500).json({ error: 'AI failed to generate questions for the combined exam. Please try again or adjust parameters.' });
            }

            console.log(`User ${userId}: AI successfully generated ${allQuestions.length} questions for combined exam.`);
            // Shuffle questions if desired (optional)
            // allQuestions.sort(() => Math.random() - 0.5);

            // Structure the final quiz data object for saving
            const combinedQuizData = {
                // No need for an 'id' here, the DB row gets the quizId
                quiz_type: 'Combined',
                class: class_name,
                curriculum: curriculum,
                subject: subject,
                chapters: chapters,
                questions: allQuestions // This is the array of questions from all types
            };


            // Save the combined quiz data, linking it to the user
            const quizId = uuidv4(); // Generate a unique ID for this combined quiz instance in the DB
            // userId is already defined from authenticateToken

            const insertSql = `INSERT INTO quizzes (id, user_id, quiz_type, "class", curriculum, subject, chapters, questions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`; // SQL string
            const insertParams = [quizId, userId, 'Combined', class_name, curriculum, subject, chapters, JSON.stringify(combinedQuizData)]; // Parameters

            console.log(`User ${userId}: Executing SQL (Combined Insert): ${insertSql}`); // Logging
            console.log(`User ${userId}: With parameters (Combined Insert):`, insertParams); // Logging


            db.run(insertSql, insertParams, // Use variables for SQL and parameters
                   function(saveErr) { // Use function keyword for 'this' context (if needed)
                if (saveErr) {
                    console.error(`User ${userId}: Error saving generated combined exam to database:`, saveErr.message);
                    return res.status(500).json({ error: 'Failed to save generated combined exam.' });
                }
                console.log(`User ${userId}: Combined Exam saved to database with ID: ${quizId}`);

                // Send the quiz ID back for frontend redirection
                res.status(200).json({ success: true, quizId: quizId });
            });

        } catch (error) {
            console.error(`User ${userId}: Error during combined exam generation process:`, error.message);
            // Handle errors from decryption or overall process
            // Send the error message from the helper function
            res.status(500).json({ error: error.message || 'An error occurred during combined exam generation.' });
        }
    });
});

// Protected Route: Get a specific quiz by ID (Checks Ownership)
// Uses authenticateToken middleware and checks if the quiz belongs to the user
app.get('/quiz/:quizId', authenticateToken, (req, res) => { // Middleware Applied
        const quizId = req.params.quizId; // Get quiz ID from URL parameter
        const userId = req.user.id; // Get authenticated user ID
        console.log(`User ${userId}: Received request to fetch quiz with ID: ${quizId}.`);

        if (!quizId) {
            console.error(`User ${userId}: No quizId provided in URL parameters for fetch.`);
            return res.status(400).json({ error: 'Quiz ID is required.' });
        }

        // Retrieve the quiz data from the database, checking that it belongs to the user
        // Select includes "class" quoted
        const selectSql = `SELECT id, quiz_type, "class", curriculum, subject, chapters, questions FROM quizzes WHERE id = ? AND user_id = ?`; // Query by quiz ID AND user ID
        const selectParams = [quizId, userId]; // Parameters for the query

        console.log(`User ${userId}: Executing SQL (Fetch Quiz): ${selectSql}`); // Logging
        console.log(`User ${userId}: With parameters (Fetch Quiz):`, selectParams); // Logging


        // Use db.get because we expect a single row or no row
        db.get(selectSql, selectParams, (err, row) => { // Use variables for SQL and parameters
            if (err) {
                console.error(`User ${userId}: Database error retrieving quiz:`, err.message);
                return res.status(500).json({ error: 'Failed to retrieve quiz data from database.' });
            }

            // If no row is returned, the quiz was not found or does not belong to the user
            if (!row) {
                console.log(`User ${userId}: Quiz with ID ${quizId} not found or does not belong to user.`);
                return res.status(404).json({ error: `Quiz not found or you do not have permission to view it.` }); // 404 Not Found
            }

            console.log(`User ${userId}: Quiz with ID ${quizId} found and belongs to user. Parsing questions...`);

            // Parse the questions JSON string from the database
            try {
                const questionsData = JSON.parse(row.questions); // Assuming 'questions' column stores {"questions": [...]}

                // Prepare data to send to the frontend for taking the quiz
                // Remove sensitive data (correct answers, explanations) from questions array
                 const questionsForFrontend = questionsData.questions.map(q => {
                     // Use spread syntax to exclude answer and explanation
                     // Ensure a default empty array for options if missing from source
                     const { answer, explanation, options, ...rest } = q;
                     return {
                         ...rest,
                         options: options || [] // Ensure options is always an array for the frontend
                     }; // Return question object without answer/explanation
                 });

                // Structure the final quiz data object to send to the frontend
                const quizDataForFrontend = {
                    id: row.id, // Use the id from the database row
                    quiz_type: row.quiz_type,
                    class: row.class, // Use row.class here, which was selected as "class"
                    curriculum: row.curriculum,
                    subject: row.subject,
                    chapters: row.chapters,
                    questions: questionsForFrontend // Send the cleaned questions array
                };

                console.log(`User ${userId}: Successfully retrieved and parsed quiz ID ${quizId}. Sending data to frontend.`);
                // Send the quiz data to the frontend with a 200 OK status
                res.status(200).json(quizDataForFrontend);

            } catch (parseError) {
                // Handle errors during JSON parsing
                console.error(`User ${userId}: Error parsing questions JSON from database:`, parseError);
                res.status(500).json({ error: 'Failed to parse quiz questions data.' });
            }
        });
    });


// Protected Route: Submit Quiz Answers and Evaluate
// Uses authenticateToken middleware and handles optional file upload for context
app.post('/submit-quiz/:quizId', authenticateToken, upload.single('pdfFile'), async (req, res) => {
    const quizId = req.params.quizId;
    const userAnswers = req.body;
    const userId = req.user.id;
    const uploadedFile = req.file;
    const filePath = uploadedFile ? uploadedFile.path : null;

    let finalExtractedText = '';
    let totalScore = 0;
    let overallPercentage = 0;
    const evaluationResults = [];

    console.log(`User ${userId}: Received submission for quiz ID: ${quizId}`);
    console.log(`User ${userId}: PDF file uploaded: ${uploadedFile ? 'Yes' : 'No'}`);

    try {
        // Step 1: Retrieve quiz data and API key
        console.log(`User ${userId}: Fetching quiz data and API key for evaluation...`);

        const row = await new Promise((resolve, reject) => {
            db.get(
                `SELECT q.questions, q.quiz_type, ak.encrypted_key, ak.api_type
                 FROM quizzes q
                 JOIN api_keys ak ON ak.user_id = ?
                 WHERE q.id = ? AND q.user_id = ?`,
                [userId, quizId, userId],
                (err, row) => {
                    if (err) {
                        console.error(`User ${userId}: DB Error fetching quiz/key:`, err.message);
                        return reject(err);
                    }
                    if (!row) {
                        console.warn(`User ${userId}: Quiz ${quizId} not found or not owned by user.`);
                        return resolve(null);
                    }
                    resolve(row);
                }
            );
        });

        if (!row) {
            if (filePath) {
                console.log(`User ${userId}: Cleaning up uploaded PDF: ${filePath}`);
                await fs.promises.unlink(filePath).catch(err =>
                    console.error(`Error deleting file ${filePath}:`, err)
                );
            }
            return res.status(404).json({ error: 'Quiz not found or unauthorized access.' });
        }

        // Step 2: OCR with Google Cloud Vision
        if (filePath) {
            console.log(`User ${userId}: Sending PDF to Google Cloud Vision API from: ${filePath}`);
            try {
                const pdfBuffer = await fs.promises.readFile(filePath);
                console.log(`User ${userId}: PDF read into buffer. Size: ${pdfBuffer.length} bytes.`);

                const request = {
                    requests: [{
                        inputConfig: {
                            content: pdfBuffer.toString('base64'),
                            mimeType: 'application/pdf',
                        },
                        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                    }],
                };

                console.log(`User ${userId}: Sending request to Vision API...`);
                const [response] = await visionClient.batchAnnotateFiles(request);
                console.log(`User ${userId}: Response received from Vision API.`);

                const fileAnnotationResponse = response?.responses?.[0];
                if (fileAnnotationResponse?.responses?.length > 0) {
                    finalExtractedText = fileAnnotationResponse.responses
                        .map(page => page.fullTextAnnotation?.text)
                        .filter(Boolean)
                        .join('\n')
                        .trim();
                } else {
                    console.warn(`User ${userId}: No valid text found in OCR response.`);
                }

                console.log(`User ${userId}: Extracted text length: ${finalExtractedText.length}`);
            } catch (error) {
                console.error(`User ${userId}: Vision API error: ${error.message}`);
                finalExtractedText = '';
            }
        } else {
            console.log(`User ${userId}: No PDF file uploaded. Skipping OCR.`);
        }

        // Step 3: Evaluate User Answers
        console.log(`User ${userId}: Starting quiz evaluation.`);

        const { questions, quiz_type, encrypted_key, api_type } = row;
        const originalQuestions = JSON.parse(questions).questions;
        const apiKey = decryptApiKey(encrypted_key, encryptionKey, iv);

        for (const originalQ of originalQuestions) {
            const currentUserAnswer = userAnswers[`answer_${originalQ.id}`] || '';
            const result = {
                question: originalQ.question,
                type: originalQ.type,
                correct_answer: originalQ.answer,
                explanation: originalQ.explanation,
                user_answer: currentUserAnswer,
                extracted_pdf_text_used: finalExtractedText || 'No text extracted or uploaded.',
                score: 0,
                feedback: 'Not evaluated',
                correct_parts: 'N/A',
                improvements: 'N/A',
                is_correct: false
            };

            if (['MCQ', 'FIB'].includes(originalQ.type)) {
                const isCorrect = originalQ.type === 'MCQ'
                    ? userAnswerMatchesMCQ(originalQ, currentUserAnswer)
                    : userAnswerMatchesFIB(originalQ, currentUserAnswer);

                Object.assign(result, {
                    is_correct: isCorrect,
                    score: isCorrect ? 10 : 0,
                    feedback: isCorrect ? 'Correct.' : 'Incorrect.',
                    correct_parts: isCorrect ? originalQ.answer : 'N/A',
                    improvements: isCorrect ? 'N/A' : `The correct answer is ${originalQ.answer}.`
                });

                console.log(`User ${userId}: Evaluated ${originalQ.type} question (ID: ${originalQ.id}) - Correct: ${isCorrect}`);
            } else if (originalQ.type === 'Descriptive') {
                console.log(`User ${userId}: Evaluating descriptive question ID: ${originalQ.id}`);
                const hasAnswerText = currentUserAnswer.trim() || finalExtractedText.trim();

                Object.assign(result, {
                    feedback: hasAnswerText ? 'Evaluation pending from AI...' : 'No answer text provided.',
                    improvements: hasAnswerText ? 'N/A' : 'Provide a written or typed answer.'
                });

                if (hasAnswerText) {
                    try {
                        const aiEvaluation = await evaluateDescriptiveAnswer(
                            apiKey, api_type, originalQ, currentUserAnswer, finalExtractedText
                        );

                        Object.assign(result, {
                            score: aiEvaluation.score,
                            feedback: aiEvaluation.feedback,
                            correct_parts: aiEvaluation.correct_parts,
                            improvements: aiEvaluation.improvements
                        });

                        console.log(`User ${userId}: AI evaluation complete for question ID ${originalQ.id}`);
                    } catch (err) {
                        console.error(`User ${userId}: AI evaluation failed: ${err.message}`);
                        Object.assign(result, {
                            score: 0,
                            feedback: `Evaluation failed: ${err.message}`,
                            improvements: 'Check your AI connection and try again.'
                        });
                    }
                }
            } else {
                console.warn(`User ${userId}: Unknown question type: ${originalQ.type}`);
                result.feedback = `Skipped: Unknown question type "${originalQ.type}".`;
            }

            totalScore += result.score;
            evaluationResults.push(result);
        }

        // Step 4: Save Results
        const maxPossibleScore = originalQuestions.length * 10;
        overallPercentage = maxPossibleScore ? (totalScore / maxPossibleScore) * 100 : 0;
        const resultId = uuidv4();

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO results (id, user_id, quiz_id, score, feedback, submitted_at)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [resultId, userId, quizId, overallPercentage, JSON.stringify(evaluationResults)],
                function (err) {
                    if (err) {
                        console.error(`User ${userId}: DB error saving results:`, err.message);
                        return reject(err);
                    }
                    console.log(`User ${userId}: Result saved with ID: ${resultId}`);
                    resolve(this.lastID);
                }
            );
        });

        // Step 5: Respond to Client
        res.status(200).json({
            score: parseFloat(overallPercentage.toFixed(2)),
            totalScore,
            maxPossibleScore,
            results: evaluationResults,
            message: 'Evaluation complete'
        });

    } catch (error) {
        console.error(`User ${userId}: Error during evaluation:`, error.message);
        res.status(500).json({
            score: 0,
            results: [],
            message: 'An error occurred during evaluation.',
            error: error.message
        });
    } finally {
        // Step 6: Clean Up Uploaded File
        if (filePath) {
            console.log(`User ${userId}: Deleting uploaded file: ${filePath}`);
            await fs.promises.unlink(filePath).catch(err =>
                console.error(`User ${userId}: File deletion error:`, err)
            );
        }
    }
});

// Helper functions
function userAnswerMatchesMCQ(question, userAnswer) {
    return userAnswer.trim().toUpperCase() === question.answer.trim().toUpperCase().split('.')[0];
}

function userAnswerMatchesFIB(question, userAnswer) {
    return userAnswer.trim().toLowerCase() === question.answer.trim().toLowerCase();
}

// Protected Route: Chatbot endpoint
app.post('/chatbot', authenticateToken, (req, res) => { // authenticateToken applied
        const userId = req.user.id; // Get user ID from authenticated token payload
        const userMessage = req.body.message;
        console.log(`User ${userId}: Received chatbot message.`);

        if (!userMessage) {
            return res.status(400).json({ error: 'Message is required.' });
        }

        // Retrieve API key and type for the authenticated user
        db.get(`SELECT encrypted_key, api_type FROM api_keys WHERE user_id = ?`, [userId], async (err, row) => { // Fetch by user_id
            if (err) {
              console.error(`User ${userId}: Database error retrieving API key for chatbot:`, err.message);
              return res.status(500).json({ error: 'Failed to retrieve API key.' });
            }

            if (!row) {
                console.warn(`User ${userId}: API key not found for chatbot.`);
                return res.status(404).json({ error: 'AI connection details not found for your account. Please set your API key first.' });
            }

            const { encrypted_key, api_type } = row;

            try {
              // Decrypt the API key using helper function
              const apiKey = decryptApiKey(encrypted_key, encryptionKey, iv);
              console.log(`User ${userId}: API Key retrieved for chatbot. Type:`, api_type);

              let botResponse = '';

              // Use the apiKey and api_type retrieved for the user
              if (api_type === 'OpenAI') {
                console.log(`User ${userId}: Calling OpenAI API for chatbot...`);
                const openai = new OpenAI({ apiKey: apiKey });
                const completion = await openai.chat.completions.create({
                  model: "gpt-3.5-turbo", // or another suitable model
                  messages: [{"role": "user", "content": userMessage}],
                  temperature: 0.7,
                });
                botResponse = completion.choices[0].message.content || '';
              } else if (api_type === 'Gemini') {
                console.log(`User ${userId}: Calling Gemini API for chatbot...`);
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }); // Use a model with larger context if needed

                const result = await model.generateContent(userMessage);
                const response = await result.response;
                botResponse = response.text() || '';
              } else {
                console.error(`User ${userId}: Unknown API type stored: ${api_type}`);
                return res.status(500).json({ error: 'Configuration error: Unknown API type.' });
              }

              res.status(200).json({ response: botResponse });

            } catch (apiError) {
              console.error(`User ${userId}: Error calling AI API for chatbot:`, apiError);
              let errorMessage = 'Error communicating with the AI.';
              // Improved error message extraction and handling
              const lowerCaseErrorMessage = (apiError.message || '').toLowerCase();
              if (lowerCaseErrorMessage.includes('invalid api key') || lowerCaseErrorMessage.includes('authentication_error') || lowerCaseErrorMessage.includes('unauthorized') || (apiError.response && apiError.response.status === 401)) {
                errorMessage = 'Invalid or expired API key. Please set your API key again.';
              } else if (apiError.response && apiError.response.data && apiError.response.data.error) {
                errorMessage = `AI API Error: ${apiError.response.data.error.message}`;
              } else if (apiError.error && apiError.error.message) { // Handle errors from OpenAI library
                errorMessage = `AI API Error: ${apiError.error.message}`;
              } else if (typeof apiError === 'string') { // Handle simple string errors
                errorMessage = `AI API Error: ${apiError}`;
              }
              res.status(500).json({ error: errorMessage });
            }
        });
    });


// Protected Route: Get a list of quizzes generated by the logged-in user
// Uses authenticateToken middleware
app.get('/user/quizzes', authenticateToken, (req, res) => { // Middleware Applied
    const userId = req.user.id; // Get authenticated user ID
    console.log(`User ${userId}: Received request to fetch list of quizzes.`);

    // Query the quizzes table for all quizzes belonging to this user
    // Select only summary columns, exclude the large 'questions' JSON
    const selectSql = `SELECT id, quiz_type, "class", curriculum, subject, chapters, created_at FROM quizzes WHERE user_id = ? ORDER BY created_at DESC`; // Order by creation date, newest first
    const selectParams = [userId]; // Parameter is the user ID

    console.log(`User ${userId}: Executing SQL (List Quizzes): ${selectSql}`); // Logging
    console.log(`User ${userId}: With parameters (List Quizzes):`, selectParams); // Logging


    // Use db.all because we expect potentially multiple rows
    db.all(selectSql, selectParams, (err, rows) => { // Use variables for SQL and parameters
        if (err) {
            console.error(`User ${userId}: Database error retrieving list of quizzes:`, err.message);
            return res.status(500).json({ error: 'Failed to retrieve quiz history.' });
        }

        // Rows is an array of objects, where each object is a quiz summary
        console.log(`User ${userId}: Successfully retrieved ${rows ? rows.length : 0} quizzes.`);
        res.status(200).json(rows || []); // Send the array of quiz summaries, or an empty array if none found
    });
});

// Protected Route: Get a list of quiz results for the logged-in user
// Uses authenticateToken middleware
app.get('/user/results', authenticateToken, (req, res) => { // Middleware Applied
    const userId = req.user.id; // Get authenticated user ID
    console.log(`User ${userId}: Received request to fetch list of results.`);

    // Query the results table for all results belonging to this user
    // Join with quizzes table to get some basic info about the quiz
    const selectSql = `SELECT r.id AS result_id, r.quiz_id, r.score, r.submitted_at,q.quiz_type,q."class",q.subject,q.chapters FROM results r JOIN quizzes q ON r.quiz_id = q.id WHERE r.user_id = ? ORDER BY r.submitted_at DESC`; // Order by submission date, newest first

    const selectParams = [userId]; // Parameter is the user ID

    console.log(`User ${userId}: Executing SQL (List Results): ${selectSql}`); // Logging
    console.log(`User ${userId}: With parameters (List Results):`, selectParams); // Logging


    // Use db.all because we expect potentially multiple rows
    db.all(selectSql, selectParams, (err, rows) => { // Use variables for SQL and parameters
        if (err) {
            console.error(`User ${userId}: Database error retrieving list of results:`, err.message);
            return res.status(500).json({ error: 'Failed to retrieve result history.' });
        }

        // Rows is an array of objects, where each object is a result summary with some quiz info
        console.log(`User ${userId}: Successfully retrieved ${rows ? rows.length : 0} results.`);
        res.status(200).json(rows || []); // Send the array of result summaries, or an empty array
    });
});

// Protected Route: Get details for a specific quiz result by ID (Checks Ownership)
// Uses authenticateToken middleware and checks if the result belongs to the user
app.get('/user/results/:resultId', authenticateToken, (req, res) => { // Middleware Applied
    const resultId = req.params.resultId; // Get result ID from URL parameter
    const userId = req.user.id; // Get authenticated user ID
    console.log(`User ${userId}: Received request to fetch result with ID: ${resultId}.`);

    if (!resultId) {
        console.error(`User ${userId}: No resultId provided in URL parameters for fetch.`);
        return res.status(400).json({ error: 'Result ID is required.' });
    }

    // Query the results table for the specific result belonging to this user
    // Select all columns, including the feedback JSON
    const selectSql = `SELECT id, user_id, quiz_id, score, feedback, submitted_at FROM results WHERE id = ? AND user_id = ?`; // Query by result ID AND user ID
    const selectParams = [resultId, userId]; // Parameters for the query

    console.log(`User ${userId}: Executing SQL (Fetch Result Detail): ${selectSql}`); // Logging
    console.log(`User ${userId}: With parameters (Fetch Result Detail):`, selectParams); // Logging


    // Use db.get because we expect a single row or no row
    db.get(selectSql, selectParams, (err, row) => { // Use variables for SQL and parameters
        if (err) {
            console.error(`User ${userId}: Database error retrieving result details:`, err.message);
            return res.status(500).json({ error: 'Failed to retrieve result details from database.' });
        }

        // If no row is returned, the result was not found or does not belong to the user
        if (!row) {
            console.log(`User ${userId}: Result with ID ${resultId} not found or does not belong to user.`);
            return res.status(404).json({ error: `Result not found or you do not have permission to view it.` }); // 404 Not Found
        }

        console.log(`User ${userId}: Result with ID ${resultId} found and belongs to user. Parsing feedback...`);

        // Parse the feedback JSON string from the database
        try {
            const feedbackData = JSON.parse(row.feedback); // Assuming 'feedback' column stores JSON

            // Structure the final result data object to send to the frontend
            const resultDataForFrontend = {
                id: row.id,
                quiz_id: row.quiz_id,
                score: row.score, // Score (real number)
                submitted_at: row.submitted_at, // Timestamp
                feedback: feedbackData // Send the parsed feedback object/array
                // Note: We don't fetch quiz details here, as the list view already provides them.
                // If needed, you could perform a JOIN here similar to the /user/results endpoint.
            };

            console.log(`User ${userId}: Successfully retrieved and parsed result ID ${resultId}. Sending data to frontend.`);
            // Send the result details to the frontend with a 200 OK status
            res.status(200).json(resultDataForFrontend);

        } catch (parseError) {
            // Handle errors during JSON parsing
            console.error(`User ${userId}: Error parsing feedback JSON from database:`, parseError);
            res.status(500).json({ error: 'Failed to parse result feedback data.' });
        }
    });
});

// Protected Route: Get profile information for the logged-in user
// Uses authenticateToken middleware
app.get('/user/profile', authenticateToken, (req, res) => { // Middleware Applied
    const userId = req.user.id; // Get authenticated user ID
    console.log(`User ${userId}: Received request to fetch profile info.`);

    // Query the users table for the authenticated user's information
    const selectSql = `SELECT id, username FROM users WHERE id = ?`; // Select ID and username
    const selectParams = [userId]; // Parameter is the user ID

    console.log(`User ${userId}: Executing SQL (Fetch Profile): ${selectSql}`); // Logging
    console.log(`User ${userId}: With parameters (Fetch Profile):`, selectParams); // Logging


    // Use db.get because we expect a single row for the user
    db.get(selectSql, selectParams, (err, row) => { // Use variables for SQL and parameters
        if (err) {
            console.error(`User ${userId}: Database error retrieving profile info:`, err.message);
            return res.status(500).json({ error: 'Failed to retrieve profile information.' });
        }

        // If no row is returned, something is fundamentally wrong (user exists per token, but not in DB?)
        if (!row) {
            console.error(`User ${userId}: User with ID ${userId} not found in DB despite valid token.`);
            // This scenario implies a serious inconsistency. Force re-login.
            return res.status(404).json({ error: 'User not found. Please log in again.' }); // Or 401/403
        }

        console.log(`User ${userId}: Successfully retrieved profile info.`);
        // Send the user data (excluding password hash) to the frontend
        res.status(200).json({ id: row.id, username: row.username });
    });
});


// Root route for testing
app.get('/', (req, res) => {
  res.send('Quiz Genie Backend is running!');
});

// Start server
app.listen(port, () => {
  console.log(`Backend server listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});
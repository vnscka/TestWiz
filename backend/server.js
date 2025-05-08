import express from 'express';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import vision from '@google-cloud/vision';

const saltRounds = 10;
dotenv.config();

const jwtSecret = process.env.JWT_SECRET;

// --- Ollama Configuration ---
const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434'; // Default Ollama URL
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3:latest'; // Default model (change to one you have pulled)
console.log(`Configured Ollama Endpoint: ${OLLAMA_ENDPOINT}`);
console.log(`Configured Ollama Model: ${OLLAMA_MODEL}`);
// --- End Ollama Configuration ---

const visionClient = new vision.ImageAnnotatorClient();


if (!jwtSecret) {
    console.error("FATAL ERROR: Missing JWT_SECRET in .env file.");
    console.error("Please ensure JWT_SECRET is set correctly.");
    process.exit(1);
}


const app = express();
const port = process.env.BACKEND_PORT || 3001;

const corsOptions = {
    origin: 'http://localhost:8080', // Adjust origin as needed
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
    
    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            console.warn("Authentication failed: Invalid token.", err.message);
            return res.sendStatus(403);
        }
        req.user = user; 
        console.log(`Token authenticated successfully for user ID: ${user.id}`);
        next();
    });
};

// Database setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
            if(pragmaErr) console.error("Error enabling foreign keys:", pragmaErr.message);
            else console.log("Foreign keys enabled.");
        });
        
        const createUserTableSql = `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`;
        db.run(createUserTableSql, (createErr) => {
            if(createErr) console.error("Error creating users table:", createErr.message);
            else console.log("users table checked/created.");
        });
        
        const createQuizzesTableSql = `CREATE TABLE IF NOT EXISTS quizzes (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,quiz_type TEXT,"class" TEXT,curriculum TEXT,subject TEXT,chapters TEXT,questions TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE)`;
        db.run(createQuizzesTableSql, (createErr) => {
            if(createErr) console.error("Error creating quizzes table:", createErr.message);
            else console.log("quizzes table checked/created.");
        });
        
        const createResultsTableSql = `CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,quiz_id TEXT NOT NULL,score REAL,feedback TEXT,submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE)`;
        db.run(createResultsTableSql, (createErr) => {
            if(createErr) console.error("Error creating results table:", createErr.message);
            else console.log("results table checked/created.");
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
        process.exit(0); 
    });
});


// --- Verify Ollama Endpoint on Startup ---
async function verifyOllamaConnection() {
    console.log(`Attempting to verify Ollama connection at ${OLLAMA_ENDPOINT}...`);
    try {
        // Make a request to the /api/tags endpoint, which lists available models
        const response = await axios.get(`${OLLAMA_ENDPOINT}/api/tags`);

        if (response.status === 200) {
            console.log('Ollama connection successful!');
            console.log('Available models:', response.data.models.map(m => m.name).join(', '));

            // Optional: Check if the configured model exists
            const configuredModelExists = response.data.models.some(m => m.name === OLLAMA_MODEL);
            if (configuredModelExists) {
                console.log(`Configured model "${OLLAMA_MODEL}" is available.`);
            } else {
                console.warn(`Configured model "${OLLAMA_MODEL}" is NOT available. Please run 'ollama pull ${OLLAMA_MODEL}'`);
                 // Depending on how critical the AI is, you might want to exit here or log a critical error
                 // process.exit(1);
            }

        } else {
            console.error(`Ollama connection failed: Received status code ${response.status}`);
             // Depending on how critical the AI is, you might want to exit here or log a critical error
             // process.exit(1);
        }
    } catch (error) {
        console.error('Error verifying Ollama connection:');

        if (error.code === 'ECONNREFUSED') {
            console.error(`-> Connection refused. Is Ollama running? Is it accessible at ${OLLAMA_ENDPOINT}?`);
        } else if (error.code === 'ENOTFOUND') {
             console.error(`-> Host not found. Is the OLLAMA_ENDPOINT address correct: ${OLLAMA_ENDPOINT}?`);
        } else if (error.response) {
             console.error(`-> HTTP error: Status ${error.response.status} - ${error.response.statusText}`);
             if (error.response.data) {
                 console.error('   Details:', error.response.data);
             }
        } else {
            console.error('-> An unexpected error occurred:', error.message);
        }
         // Depending on how critical the AI is, you might want to exit here or log a critical error
         // process.exit(1);
    }
}

// Call the verification function when the server starts up
verifyOllamaConnection();

// --- End Verify Ollama Endpoint ---


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

    // --- Helper function to clean text (used for AI responses) ---
    // Defined globally as it might be used in multiple places
    const cleanText = (text) => {
        if (typeof text !== 'string') return text; // Return non-strings as is
        // Replace newline characters with a space
        let cleaned = text.replace(/[\n\r]/g, ' ');
        // Replace specific non-standard spaces/separators and collapse remaining whitespace
        cleaned = cleaned.replace(/[\u00A0\u200B-\u200F\u2028\u2029\uFEFF]/g, ' ');
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        // Remove common ASCII control characters (0x00 to 0x1F and 0x7F)
        cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
        return cleaned;
    };
    // --- End cleanText Helper ---


// --- Helper function to generate quiz using AI (using Ollama) ---
// MODIFIED: Removed API key/type parameters, calls Ollama API
async function generateQuizWithAI(quiz_type, class_name, curriculum, subject, chapters, num_questions) { // Simplified signature
        console.log(`Generating quiz using Ollama Model: ${OLLAMA_MODEL}`);
        console.log(`Ollama Endpoint: ${OLLAMA_ENDPOINT}`);


        // Construct the prompt for the AI based on the requirements
        // Prompt structure remains similar, focusing on content and format
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

        console.log("Sending prompt to AI for quiz generation:");


        try {
            // --- Ollama API Call ---
            console.log(`Calling Ollama API at ${OLLAMA_ENDPOINT}/api/generate`);
            const ollamaResponse = await axios.post(`${OLLAMA_ENDPOINT}/api/generate`, {
            model: OLLAMA_MODEL,
            prompt: prompt,
            format: 'json', // Request JSON format if supported by the model
            options: { // Adjust Ollama options as needed
                temperature: 0.7,
                // You might add other options like top_p, top_k, etc.
            },
            stream: false,
            timeout: 120000
            // Ollama's /api/generate endpoint is typically single-turn
            // For chat capabilities, you might use /api/chat
            // If model doesn't support JSON format, you'll need robust post-processing
            });
let rawResponseText = JSON.stringify(ollamaResponse.data.response);
rawResponseText = ollamaResponse.data.response || '';
console.log("Raw AI Response for quiz generation:");


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
                 throw new Error("AI failed to generate questions in the expected format.");
             }

            // Use the cleanText function you had for questions/answers/etc.
             quizData.questions = quizData.questions.map(q => {
                 const cleanedQuestion = cleanText(q.question);
                 const cleanedAnswer = cleanText(q.answer);
                 const cleanedExplanation = cleanText(q.explanation);
                 const cleanedOptions = Array.isArray(q.options) ? q.options.map(opt => cleanText(opt)) : (q.options || undefined);

                 return {
                     ...q, // Keep other properties like 'id', 'type'
                     question: cleanedQuestion,
                     answer: cleanedAnswer,
                     explanation: cleanedExplanation,
                     ...(cleanedOptions !== undefined && { options: cleanedOptions })
                 };
             });
             console.log("Data cleaning complete.");

             // Assign unique IDs if not provided by AI (or regenerate them to be safe)
             quizData.questions = quizData.questions.map((q) => ({ // Removed index param if not used
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

    } catch (ollamaError) {
        // Handle errors during the Ollama API call itself (network issues, etc.)
        console.error('Error during Ollama quiz generation call:', ollamaError);
        let errorMessage = 'Error communicating with the AI during quiz generation.';

        if (ollamaError.message) {
            errorMessage = `Ollama API Error: ${ollamaError.message}`;
        }
        // Check for common network/connection errors
        if (ollamaError.code === 'ECONNREFUSED' || ollamaError.message.includes('connect ECONNREFUSED')) {
            errorMessage = `Connection refused: Is Ollama running and accessible at ${OLLAMA_ENDPOINT}?`;
        } else if (ollamaError.message.includes('ENOTFOUND')) {
             errorMessage = `Ollama endpoint not found: Check the address ${OLLAMA_ENDPOINT}`;
        } else if (ollamaError.response) {
             errorMessage = `Ollama API Error ${ollamaError.response.status}: ${ollamaError.response.statusText}`;
             if (ollamaError.response.data) {
                 errorMessage += ` - Details: ${JSON.stringify(ollamaError.response.data)}`;
             }
        }


        throw new Error(errorMessage); // Rethrow with a specific message
    }
}

    // --- Helper function to evaluate a single descriptive answer using AI (using Ollama) ---
    // MODIFIED: Removed API key/type parameters, calls Ollama API
    async function evaluateDescriptiveAnswer(question, typedAnswer, pdfText = '') { // Simplified signature
        console.log(`Evaluating descriptive answer using Ollama Model: ${OLLAMA_MODEL}`);
        console.log(`Ollama Endpoint: ${OLLAMA_ENDPOINT}`);

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
            // --- Ollama API Call ---
            // Using /api/generate for single-turn evaluation
            console.log(`Calling Ollama API at ${OLLAMA_ENDPOINT}/api/generate`);
            const ollamaResponse = await axios.post(`${OLLAMA_ENDPOINT}/api/generate`, {
                model: OLLAMA_MODEL,
                prompt: prompt,
                format: 'json', // Request JSON format
                options: { // Adjust options for focused evaluation
                    temperature: 0.3, // Lower temp
                    // top_p, top_k etc.
                },
                stream: false,
                timeout: 120000
            });

            let rawResponseText = ollamaResponse.data.response || ''; // Ollama /api/generate returns 'response' field


            console.log("Raw AI Response for evaluation (first 500 chars):", rawResponseText.substring(0, Math.min(rawResponseText.length, 500)) + (rawResponseText.length > 500 ? '...' : ''));


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

        } catch (ollamaError) {
            console.error('Error during Ollama evaluation call:', ollamaError);
            let errorMessage = 'Error communicating with the AI during evaluation.';

            if (ollamaError.message) {
                errorMessage = `Ollama API Error: ${ollamaError.message}`;
            }
            // Check for common network/connection errors
            if (ollamaError.code === 'ECONNREFUSED' || ollamaError.message.includes('connect ECONNREFUSED')) {
                errorMessage = `Connection refused: Is Ollama running and accessible at ${OLLAMA_ENDPOINT}?`;
            } else if (ollamaError.message.includes('ENOTFOUND')) {
                 errorMessage = `Ollama endpoint not found: Check the address ${OLLAMA_ENDPOINT}`;
            } else if (ollamaError.response) {
                 errorMessage = `Ollama API Error ${ollamaError.response.status}: ${ollamaError.response.statusText}`;
                 if (ollamaError.response.data) {
                     errorMessage += ` - Details: ${JSON.stringify(ollamaError.response.data)}`;
                 }
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

// Removed Protected Route: Set API key and type (/set-api-key)

// Protected Route: Generate a General Quiz (MCQ/FIB)
// Uses authenticateToken middleware
// MODIFIED: Removed API key fetching, calls Ollama
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

    // Removed database query to api_keys table
    // Removed API key decryption logic

        try {
            // Call the AI helper function to generate quiz data (now calls Ollama)
            // MODIFIED: Removed apiKey, apiType parameters
            const quizData = await generateQuizWithAI(
                quiz_type, class_name, curriculum, subject, chapters, numberOfQuestions
            );
            console.log(`User ${userId}: AI successfully generated quiz data.`);

            // Generate a unique ID for the new quiz
            const quizId = uuidv4();

            // Save the generated quiz data to the database, linking it to the user
            const insertSql = 'INSERT INTO quizzes (id, user_id, quiz_type, "class", curriculum, subject, chapters, questions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
            const insertParams = [quizId, userId, quiz_type, class_name, curriculum, subject, chapters, JSON.stringify(quizData)];

            console.log(`User ${userId}: Executing SQL (Quiz Insert): ${insertSql}`);
            // console.log(`User ${userId}: With parameters (Quiz Insert):`, insertParams); // Avoid logging potentially large questions

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


/// Protected Route: Generate a Descriptive Quiz
// Uses authenticateToken middleware
// MODIFIED: Removed API key fetching, calls Ollama
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

    // Convert chapters to string if array (if needed by your prompt)
    if (Array.isArray(chapters)) {
        chapters = chapters.join(', ');
    }

    // Validate question count
    const numberOfQuestions = parseInt(num_questions, 10);
    if (isNaN(numberOfQuestions) || numberOfQuestions < 1 || numberOfQuestions > 20) {
        return res.status(400).json({ error: 'Invalid question count (1-20)' });
    }

    // Removed database query to api_keys table
    // Removed API key decryption logic

    // 2. Call AI helper (now calls Ollama)
    try {
        // MODIFIED: Removed apiKey, apiType parameters from generateQuizWithAI call
        const quizData = await generateQuizWithAI(
            'Descriptive', // Hardcode quiz type
            class_name,
            curriculum,
            subject,
            chapters,
            numberOfQuestions
        );

        // Clean and validate questions (logic kept)
        if (!quizData?.questions?.length) {
            throw new Error('AI failed to generate questions');
        }

        // 3. Database insertion (logic kept)
        const quizId = uuidv4();
        const insertSql = `INSERT INTO quizzes (id,user_id,quiz_type,"class",curriculum,subject,chapters,questions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

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
        // MODIFIED: Simplified error message as API key is no longer user input
        res.status(500).json({
            error: 'Quiz generation failed: ' + error.message
        });
    }
});


    // Protected Route: Generate a Combined Exam
// Uses authenticateToken middleware
// MODIFIED: Removed API key fetching, calls Ollama
app.post('/combined-exam', authenticateToken, async (req, res) => {
    // Middleware Applied
    console.log("Received request to /combined-exam");
    const userId = req.user.id;
    
    const {
        class: class_name, curriculum, subject, chapters,
        num_mcq, num_fib, num_descriptive
    } = req.body;
    console.log(`User ${userId}: Combined Exam Parameters Received:`, {
        class_name, curriculum, subject, chapters, num_mcq, num_fib, num_descriptive
    });

    // Basic validation for combined exam counts
    if (!class_name || !curriculum || !subject || !chapters || num_mcq === undefined || num_fib === undefined || num_descriptive === undefined) {
        console.error(`User ${userId}: Missing required combined exam parameters.`);
        return res.status(400).json({ error: 'Missing required combined exam parameters.' });
    }
    
    const numMCQ = parseInt(num_mcq, 10) || 0;
    const numFIB = parseInt(num_fib, 10) || 0;
    const numDescriptive = parseInt(num_descriptive, 10) || 0;
    const totalQuestions = numMCQ + numFIB + numDescriptive;
    
    if (totalQuestions <= 0 || totalQuestions > 30) {
        console.error(`User ${userId}: Invalid total number of questions:`, totalQuestions);
        return res.status(400).json({ error: 'Total number of questions must be positive and not exceed 30.' });
    }
    try {
        let allQuestions =[];
        if (numMCQ > 0) {
            console.log(`User ${userId}: Generating ${numMCQ} MCQ questions...`);
            try {
                const mcqQuizData = await generateQuizWithAI(
                    'MCQ', class_name, curriculum, subject, chapters, numMCQ
                );
                if (mcqQuizData && Array.isArray(mcqQuizData.questions)) {
                    allQuestions = allQuestions.concat(mcqQuizData.questions);
                } else {
                    console.warn(`User ${userId}: generateQuizWithAI did not return expected MCQ data.`);
                }
            } catch (err) {
                console.error(`User ${userId}: Error generating MCQ questions:`, err.message);
            }
        }
        if (numFIB > 0) {
            console.log(`User ${userId}: Generating ${numFIB} FIB questions...`);
            try {
                const fibQuizData = await generateQuizWithAI(
                    'FIB', class_name, curriculum, subject, chapters, numFIB
                );
                if (fibQuizData && Array.isArray(fibQuizData.questions)) {
                    allQuestions = allQuestions.concat(fibQuizData.questions);
                } else {
                    console.warn(`User ${userId}: generateQuizWithAI did not return expected FIB data.`);
                }
            } catch (err) {
                console.error(`User ${userId}: Error generating FIB questions:`, err.message);
            }
        }
        if (numDescriptive > 0) {
            console.log(`User ${userId}: Generating ${numDescriptive} Descriptive questions...`);
            try {
                const descriptiveQuizData = await generateQuizWithAI(
                    'Descriptive', class_name, curriculum, subject, chapters, numDescriptive
                );
                if (descriptiveQuizData && Array.isArray(descriptiveQuizData.questions)) {
                    allQuestions = allQuestions.concat(descriptiveQuizData.questions);
                } else {
                    console.warn(`User ${userId}: generateQuizWithAI did not return expected Descriptive data.`);
                }
            } catch (err) {
                console.error(`User ${userId}: Error generating Descriptive questions:`, err.message);
            }
        }
        if (allQuestions.length === 0 && totalQuestions > 0) {
            console.error(`User ${userId}: AI failed to generate any questions for combined exam.`);
            return res.status(500).json({ error: 'AI failed to generate questions for the combined exam. Please try again or adjust parameters.' });
        }
        console.log(`User ${userId}: AI successfully generated ${allQuestions.length} questions for combined exam.`);
        allQuestions.sort(() => Math.random() - 0.5);
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
            // console.log(`User ${userId}: With parameters (Combined Insert):`, insertParams); // Logging


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
            // MODIFIED: Simplified error message
            res.status(500).json({ error: 'Combined exam generation failed: ' + error.message });
        }
    });

// Protected Route: Submit Quiz Answers and Evaluate
// Uses authenticateToken middleware and handles optional file upload for context
// MODIFIED: Removed API key fetching for evaluation
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
        // Step 1: Retrieve quiz data (NO API KEY FETCH HERE)
        console.log(`User ${userId}: Fetching quiz data for evaluation...`);

        // MODIFIED: Removed JOIN with api_keys table
        const row = await new Promise((resolve, reject) => {
            db.get(`SELECT questions, quiz_type FROM quizzes WHERE id = ? AND user_id = ?`,[quizId, userId],(err, row) => {
                    if (err) {
                        console.error(`User ${userId}: DB Error fetching quiz:`, err.message);
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

        // Step 2: OCR with Google Cloud Vision (Logic remains the same)
        // This uses visionClient, assumed to be authenticated via other means (e.g. service account JSON file)
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

        // MODIFIED: Removed encrypted_key, api_type destructuring
        const { questions, quiz_type } = row; // Get questions and quiz_type from row
        const originalQuestions = JSON.parse(questions).questions;
        // Removed API key decryption logic
        // const apiKey = decryptApiKey(encrypted_key, encryptionKey, iv); // Remove this
        // Removed api_type variable as it's not needed

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
                        // MODIFIED: Removed apiKey, apiType parameters
                        const aiEvaluation = await evaluateDescriptiveAnswer(
                            originalQ, currentUserAnswer, finalExtractedText
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
                            improvements: 'Check the backend AI connection.' // Modified message
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

        // Step 4: Save Results (Logic remains the same)
        const maxPossibleScore = originalQuestions.length * 10;
        overallPercentage = maxPossibleScore ? (totalScore / maxPossibleScore) * 100 : 0;
        const resultId = uuidv4();

        await new Promise((resolve, reject) => {
            db.run('INSERT INTO results (id, user_id, quiz_id, score, feedback, submitted_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
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

        // Step 5: Respond to Client (Logic remains the same)
        res.status(200).json({
            score: parseFloat(overallPercentage.toFixed(2)),
            totalScore,
            maxPossibleScore,
            results: evaluationResults,
            message: 'Evaluation complete'
        });

    } catch (error) {
        console.error(`User ${userId}: Error during evaluation:`, error.message);
        // MODIFIED: Simplified error message
        res.status(500).json({
            score: 0,
            results: [],
            message: 'An error occurred during evaluation.',
            error: error.message
        });
    } finally {
        // Step 6: Clean Up Uploaded File (Logic remains the same)
        if (filePath) {
            console.log(`User ${userId}: Deleting uploaded file: ${filePath}`);
            await fs.promises.unlink(filePath).catch(err =>
                console.error(`User ${userId}: File deletion error:`, err)
            );
        }
    }
});

// Helper functions (remain the same)
function userAnswerMatchesMCQ(question, userAnswer) {
    return userAnswer.trim().toUpperCase() === question.answer.trim().toUpperCase().split('.')[0];
}

function userAnswerMatchesFIB(question, userAnswer) {
    return userAnswer.trim().toLowerCase() === question.answer.trim().toLowerCase();
}

// Protected Route: Chatbot endpoint
// MODIFIED: Removed API key fetching, call Ollama API directly
app.post('/chatbot', authenticateToken, async (req, res) => { // authenticateToken applied
        const userId = req.user.id; // Get user ID from authenticated token payload
        const userMessage = req.body.message;
        console.log(`User ${userId}: Received chatbot message.`);

        if (!userMessage) {
            return res.status(400).json({ error: 'Message is required.' });
        }

        // Removed database query to api_keys table
        // Removed API key decryption logic

        try {
              // --- Ollama API Call for Chatbot ---
            console.log(`User ${userId}: Calling Ollama API for chatbot at ${OLLAMA_ENDPOINT}/api/chat...`);
            // Ollama's /api/chat endpoint is suitable for conversational turn
            const ollamaResponse = await axios.post(`${OLLAMA_ENDPOINT}/api/chat`, {
                model: OLLAMA_MODEL,
                messages: [{ role: "user", content: userMessage }],
                options: { // Adjust options as needed for chat
                    temperature: 0.7,
                    // Add any other desired options
                },
                stream: false,
                timeout: 120000
            });

            let botResponse = '';
            // Assuming Ollama /api/chat response structure includes 'message' field
            if (ollamaResponse.data && ollamaResponse.data.message && ollamaResponse.data.message.content) {
                botResponse = ollamaResponse.data.message.content;
            } else {
                console.error(`User ${userId}: Ollama API returned unexpected response structure for chatbot:`, ollamaResponse.data);
                throw new Error("Ollama API returned an empty or invalid response for chatbot.");
            }

              console.log(`User ${userId}: Ollama API chatbot response received.`);

              // Send the AI response back to the frontend
              res.status(200).json({ response: botResponse });

            } catch (ollamaError) {
              console.error(`User ${userId}: Error calling Ollama API for chatbot:`, ollamaError);
              let errorMessage = 'Error communicating with the AI.';
              // Handle specific Ollama errors
              const lowerCaseErrorMessage = (ollamaError.message || '').toLowerCase();
              if (ollamaError.code === 'ECONNREFUSED' || lowerCaseErrorMessage.includes('connect econnrefused')) {
                  errorMessage = `Connection refused: Is Ollama running and accessible at ${OLLAMA_ENDPOINT}?`;
              } else if (lowerCaseErrorMessage.includes('enotfound')) {
                   errorMessage = `Ollama endpoint not found: Check the address ${OLLAMA_ENDPOINT}`;
              } else if (ollamaError.response) {
                   errorMessage = `Ollama API Error ${ollamaError.response.status}: ${ollamaError.response.statusText}`;
                   if (ollamaError.response.data) {
                       // Ollama often sends helpful error messages in the body
                       if (typeof ollamaError.response.data === 'object' && ollamaError.response.data.error) {
                           errorMessage += ` - Details: ${ollamaError.response.data.error}`;
                       } else {
                            errorMessage += ` - Details: ${JSON.stringify(ollamaError.response.data)}`;
                       }
                   }
              }


              res.status(500).json({ error: errorMessage });
            }
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

// Protected Route: Chatbot endpoint
// MODIFIED: Removed API key fetching, call Ollama API directly
app.post('/chatbot', authenticateToken, async (req, res) => { // authenticateToken applied
        const userId = req.user.id; // Get user ID from authenticated token payload
        const userMessage = req.body.message;
        console.log(`User ${userId}: Received chatbot message.`);

        if (!userMessage) {
            return res.status(400).json({ error: 'Message is required.' });
        }

        // Removed database query to api_keys table
        // Removed API key decryption logic

        try {
              // --- Ollama API Call for Chatbot ---
            console.log(`User ${userId}: Calling Ollama API for chatbot at ${OLLAMA_ENDPOINT}/api/chat...`);
            // Ollama's /api/chat endpoint is suitable for conversational turn
            const ollamaResponse = await axios.post(`${OLLAMA_ENDPOINT}/api/chat`, {
                model: OLLAMA_MODEL,
                messages: [{ role: "user", content: userMessage }],
                options: { // Adjust options as needed for chat
                    temperature: 0.7,
                    // Add any other desired options
                },
                stream: false,
                timeout: 120000
            });

            let botResponse = '';
            // Assuming Ollama /api/chat response structure includes 'message' field
            if (ollamaResponse.data && ollamaResponse.data.message && typeof ollamaResponse.data.message.content == 'string') {
                botResponse = ollamaResponse.data.message.content;
                console.log(`User ${userId}: Ollama API chatbot response received successfully.`);
            } else {
                console.error(`User ${userId}: Ollama API returned unexpected response structure for chatbot:`, ollamaResponse.data);
                throw new Error("Ollama API returned an empty or invalid response for chatbot.");
            }

              console.log(`User ${userId}: Ollama API chatbot response received.`);

              // Send the AI response back to the frontend
              res.status(200).json({ response: botResponse });

            } catch (ollamaError) {
              console.error(`User ${userId}: Error calling Ollama API for chatbot:`, ollamaError);
              let errorMessage = 'Error communicating with the AI.';
              // Handle specific Ollama errors
              const lowerCaseErrorMessage = (ollamaError.message || '').toLowerCase();
              if (ollamaError.code === 'ECONNREFUSED' || lowerCaseErrorMessage.includes('connect econnrefused')) {
                  errorMessage = `Connection refused: Is Ollama running and accessible at ${OLLAMA_ENDPOINT}?`;
              } else if (lowerCaseErrorMessage.includes('enotfound')) {
                   errorMessage = `Ollama endpoint not found: Check the address ${OLLAMA_ENDPOINT}`;
              } else if (ollamaError.response) {
                   errorMessage = `Ollama API Error ${ollamaError.response.status}: ${ollamaError.response.statusText}`;
                   if (ollamaError.response.data) {
                       // Ollama often sends helpful error messages in the body
                       if (typeof ollamaError.response.data === 'object' && ollamaError.response.data.error) {
                           errorMessage += ` - Details: ${ollamaError.response.data.error}`;
                       } else {
                            errorMessage += ` - Details: ${JSON.stringify(ollamaError.response.data)}`;
                       }
                   }
              }


              res.status(500).json({ error: errorMessage });
            }
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
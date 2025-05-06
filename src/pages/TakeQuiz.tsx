import React, { useEffect, useState, useRef, FormEvent } from 'react'; // Import FormEvent
import { useParams, useNavigate } from 'react-router-dom'; // Import useNavigate
import Layout from '../components/Layout';
import { Loader, BookOpen, CheckCircle } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext'; // Ensure useAuth is imported

// Define interfaces (Keep your existing interfaces)
interface Question {
    id: string;
    question: string;
    type: 'MCQ' | 'FIB' | 'Descriptive';
    options?: string[];
    answer: string; // Correct answer (backend secret)
    explanation: string; // Explanation (backend secret)
}

interface QuizData {
    id: string; // Quiz ID
    quiz_type: string; // e.g., 'MCQ', 'FIB', 'Descriptive', 'Combined'
    class: string;
    curriculum: string;
    subject: string;
    chapters: string;
    questions: Question[];
}

interface EvaluationResult {
    // Note: id is not strictly needed if you're just mapping over results array index
    id?: number; // If backend provides an ID for the result itself
    type: 'MCQ' | 'FIB' | 'Descriptive'; // Ensure type is in the result object
    explanation: string; // Explanation from backend
    score?: number; // Score for descriptive (0-10)
    feedback?: string; // Feedback for descriptive
    correct_parts?: string; // For descriptive evaluation
    improvements?: string; // For descriptive evaluation
    user_answer: string; // User's answer
    correct_answer: string; // Correct answer for comparison
    is_correct?: boolean; // For MCQ/FIB comparison
    question: string; // Original question text
}

interface SubmissionResponse {
    score: number; // Overall score (percentage)
    results: EvaluationResult[]; // Array of per-question evaluation results
    message?: string; // Success message
    error?: string; // Error message
}


const TakeQuiz = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<{ [questionId: string]: string }>({}); // State to store user answers
  const [isSubmitting, setIsSubmitting] = useState(false); // State for submission loading
  const [submissionResult, setSubmissionResult] = useState<SubmissionResponse | null>(null); // State to store evaluation results

  const { toast } = useToast();
  const { token, isLoggedIn } = useAuth(); // Get token and isLoggedIn state
  const navigate = useNavigate(); // Initialize navigate hook
  const pdfFileRef = useRef<HTMLInputElement>(null);
  const backendUrl = 'http://localhost:3001';


  useEffect(() => {
    // Redirect to login if not logged in and trying to access a quiz
    // We check isLoggedIn to prevent redirecting immediately on mount
    // while the initial localStorage check is happening in AuthProvider
    if (!isLoggedIn && !token) { // Explicitly check token too for clarity
         setError("You must be logged in to view a quiz.");
         setIsLoading(false);
         // Use a timeout to allow toast to show before redirecting
         setTimeout(() => {
             navigate('/login'); // Redirect to login page
         }, 2000); // Redirect after 2 seconds
         return; // Stop fetching if not logged in
    }


    const fetchQuiz = async () => {
      try {
          // Ensure quizId and token are available before fetching
          if (!quizId || !token) {
              console.warn("Fetch skipped: Missing quizId or token.");
              setIsLoading(false); // Stop loading if condition not met
              // Error state and redirect handled above by isLoggedIn check
              return;
          }

        const response = await fetch(`http://localhost:3001/quiz/${quizId}`, {
            method: 'GET', // Specify GET method
            headers: {
                'Authorization': `Bearer ${token}`, // <--- ADD THE AUTHORIZATION HEADER HERE
            },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Fetch quiz failed:", response.status, errorText);
          throw new Error(`Failed to fetch quiz: ${response.status} ${errorText}`);
        }

        const data: QuizData = await response.json(); // Cast data to QuizData interface
        setQuizData(data);
        console.log("Fetched quiz data:", data);

        // Initialize userAnswers state based on the fetched questions
        const initialAnswers: { [questionId: string]: string } = {};
        data.questions.forEach(q => {
            initialAnswers[q.id] = ''; // Initialize each answer as empty
        });
        setUserAnswers(initialAnswers);


      } catch (err) {
        console.error("Error fetching quiz:", err);
        // Check if the error might be due to auth failure (401/403 from backend)
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        if (errorMessage.includes('401') || errorMessage.includes('403')) {
             setError("Authentication failed. Please log in again.");
             // Consider logging out or redirecting if auth fails during fetch
             setTimeout(() => {
                 // If using AuthContext.logout, call it here
                 navigate('/login'); // Redirect to login page
             }, 2000); // Redirect after 2 seconds
        } else {
             setError(errorMessage);
        }
        toast({
            title: "Error loading quiz",
            description: "Could not retrieve the quiz questions.",
            variant: "destructive",
        });
      } finally {
        setIsLoading(false); // Stop loading regardless of outcome
      }
    };

    // Only fetch if quizId exists AND token is available (indicating logged in)
    // And only if we are currently loading (to prevent loops if isLoggedIn changes unexpectedly)
    if (quizId && token && isLoading) {
      fetchQuiz();
    } else if (!quizId) { // Handle no quiz ID provided initially
       setError("No Quiz ID provided in the URL.");
       setIsLoading(false);
    }
    // Note: isLogged checks handle the !token case and redirect logic at the start of the effect


  }, [quizId, token, toast, isLoggedIn, navigate, isLoading]); // ADD 'token', 'isLoggedIn', 'navigate', 'isLoading' to dependencies


  // Handler for updating user's answers
  const handleAnswerChange = (questionId: string, value: string) => {
      setUserAnswers(prev => ({
          ...prev,
          [questionId]: value
      }));
  };

  // Handler for submitting the quiz
  const handleSubmitQuiz = async (e: FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      setError(null); // Clear previous errors

      // Ensure quizId and token are available before submitting
      if (!quizId || !token) {
          const submitError = "Cannot submit quiz: Quiz ID or authentication token is missing.";
          console.error(submitError);
          setError(submitError);
          setIsSubmitting(false);
           // Consider redirecting if token is missing here
           if (!token) navigate('/login');
          return;
      }

      console.log("Submitting answers for quiz:", quizId, userAnswers);

        const formData = new FormData();

        // Append user answers to FormData
        // The keys MUST match the format the backend expects (e.g., answer_qID)
        Object.keys(userAnswers).forEach(questionId => {
            // Ensure the key format matches backend (answer_<questionId>)
            formData.append(`answer_${questionId}`, userAnswers[questionId]);
        });

        // Append the selected PDF file if one is chosen
        if (pdfFileRef.current && pdfFileRef.current.files && pdfFileRef.current.files[0]) {
            const file = pdfFileRef.current.files[0];
            // Append the file using the name 'pdfFile' to match the backend's Multer setup
            formData.append('pdfFile', file);
            console.log("Appending file to FormData:", file.name, file.name, "Size:", file.size, "Type:", file.type);
        } else {
            console.log("No file selected for upload.");
        }

      try {
          // Prepare the answers to send to the backend
          // Backend expects application/x-www-form-urlencoded
          const submissionBody = new URLSearchParams();
          submissionBody.append('quizId', quizId); // Include quiz ID in body too for safety/consistency
          Object.keys(userAnswers).forEach(questionId => {
              submissionBody.append(`answer_${questionId}`, userAnswers[questionId]); // Format: answer_<questionId>=<answer>
          });

          // Send the answers to the backend submit endpoint
          const response = await fetch(`${backendUrl}/submit-quiz/${quizId}`, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${token}`, // <--- CORRECT: Authorization header for submission
              },
              body: formData,
          });

          const result = await response.json();

                    if (!response.ok) {
                          const submitError = result.error || `Failed to submit quiz for evaluation: ${response.statusText}`;
                          console.error("Submit quiz failed:", response.status, submitError);
                          throw new Error(submitError);
                      }
            
                      console.log("Quiz submission successful:", result);
                      setSubmissionResult(result); // Store the evaluation results received from backend
            
                      toast({ // Show success toast
                          title: "Submission Successful!",
                          description: result.message || "Your quiz has been submitted and evaluated.",
                      }); // Store the evaluation results

      } catch (err) {
          console.error("Error submitting quiz:", err);
          setError(err instanceof Error ? err.message : 'An unknown error occurred during submission.');
          toast({
              title: "Submission Failed",
              description: "Could not submit your quiz. Please try again.",
              variant: "destructive",
          });
      } finally {
          setIsSubmitting(false);
      }
  };


  // --- Render Loading, Error, Quiz Form, or Results ---

  // Show loading if fetching quiz data or submitting
  if (isLoading && !quizData && !error) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-quiz-light">
          <div className="text-center">
            <Loader className="w-10 h-10 text-quiz-primary animate-spin mx-auto mb-4" />
            <p className="text-gray-700">{error || 'Loading quiz...'}</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Show error state if there's an error and no quiz data or results
  if (error && !quizData && !submissionResult) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-quiz-light">
            <div className="quiz-card text-center text-red-600">
                <p className="mb-4">Error: {error}</p>
                {error.includes('logged in') || error.includes('Authentication failed') ? (
                    <p>Please log in to view quizzes.</p>
                ) : (
                    <p>Could not load the quiz. Please try generating it again.</p>
                )}
            </div>
        </div>
      </Layout>
    );
  }


  // Render quiz results if submissionResult is available
  if (submissionResult) {
      return (
          <Layout>
              <div className="py-12 bg-quiz-light min-h-screen">
                  <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                      <div className="quiz-card">
                          <div className="text-center mb-8">
                               <h1 className="text-2xl font-bold gradient-text mb-2">Quiz Results</h1>
                               <p className="text-gray-600">Evaluation complete</p>

                                {/* Display Overall Score */}
                                <p className="text-xl font-semibold mt-4">
                                    Overall Score: {submissionResult.score !== undefined ? submissionResult.score.toFixed(2) : 'N/A'}%
                                </p>
                           </div>

                            {/* Loop through results and display feedback */}
                            <div className="space-y-6">
                                {submissionResult.results.map((questionResult, index) => (
                                    <div
                                        key={questionResult.question + index} // Fallback key if no ID in result
                                        className="bg-white rounded-lg shadow p-6 border border-quiz-accent/30"
                                    >
                                        {/* Question Number and Text */}
                                        <h3 className="text-lg font-semibold text-gray-800 mb-3">
                                            {index + 1}. {questionResult.question}
                                        </h3>

                                        {/* Display User's Answer */}
                                        <p className="text-sm text-gray-700 italic mb-4">
                                            <strong>Your Answer:</strong> {questionResult.user_answer || 'No answer provided'}
                                        </p>

                                        {/* Conditional Rendering for Evaluation Details based on Question Type */}
                                        {questionResult.type === 'MCQ' || questionResult.type === 'FIB' ? (
                                            <div>
                                                {/* Show Correct/Incorrect status */}
                                                {/* Use questionResult.is_correct */}
                                                <p
                                                    className={`text-sm font-semibold ${
                                                        questionResult.is_correct ? 'text-green-600' : 'text-red-600'
                                                    }`}
                                            >
                                                {questionResult.is_correct ? 'Status: Correct' : 'Status: Incorrect'}
                                            </p>

                                            {/* Show the correct answer if the user was incorrect */}
                                            {!questionResult.is_correct && questionResult.correct_answer && (
                                                <p className="text-sm text-green-600">
                                                    <strong>Correct Answer:</strong> {questionResult.correct_answer}
                                                </p>
                                            )}

                                            {/* Show the explanation if available */}
                                            {questionResult.explanation && (
                                                <p className="text-sm text-gray-600 mt-2">
                                                    <strong>Explanation:</strong> {questionResult.explanation}
                                                </p>
                                            )}
                                        </div>
                                    ) : questionResult.type === 'Descriptive' ? (
                                        <div>
                                            {/* Display AI Score (0-10) */}
                                            {questionResult.score !== undefined && (
                                                <p
                                                    className={`text-sm font-semibold ${
                                                        questionResult.score > 7
                                                            ? 'text-green-600'
                                                            : questionResult.score > 4
                                                            ? 'text-amber-600'
                                                            : 'text-red-600'
                                                    } mb-1`}
                                                >
                                                    AI Score: {questionResult.score}/10
                                                </p>
                                            )}

                                            {/* Display detailed AI Feedback */}
                                            {questionResult.feedback && (
                                                <div className="mt-2 bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                                                    <p className="font-semibold mb-1">AI Feedback:</p>
                                                    <p>{questionResult.feedback}</p>

                                                    {/* Display Correct Parts if provided by AI and not just 'N/A' */}
                                                    {questionResult.correct_parts &&
                                                        questionResult.correct_parts.trim() !== '' &&
                                                        questionResult.correct_parts.trim().toUpperCase() !== 'N/A' && (
                                                            <p className="mt-1">
                                                                <span className="font-semibold">Correct Parts:</span>{' '}
                                                                {questionResult.correct_parts}
                                                            </p>
                                                        )}

                                                    {questionResult.improvements &&
                                                        questionResult.improvements.trim() !== '' &&
                                                        questionResult.improvements.trim().toUpperCase() !== 'N/A' && (
                                                            <p className="mt-1">
                                                                <span className="font-semibold">Areas for Improvement:</span>{' '}
                                                                {questionResult.improvements}
                                                            </p>
                                                        )}
                                                </div>
                                            )}

                                            {/* Display expected answer and explanation */}
                                            {questionResult.correct_answer && (
                                                <p className="text-sm text-green-700 mt-2">
                                                    <strong>Expected Answer:</strong> {questionResult.correct_answer}
                                                </p>
                                            )}

                                            {questionResult.explanation && (
                                                <p className="text-sm text-gray-600 mt-1">
                                                    <strong>Explanation:</strong> {questionResult.explanation}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-gray-500 text-sm">
                                            Evaluation details not available for this question type.
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Add a button to take another quiz or go home */}
                        {/* Example button: */}
                        {/* <button className="mt-8 btn-primary" onClick={handleRetake}>Take Another Quiz</button> */}
                    </div>
                </div>
            </div>
        </Layout>
    );
}


  // If quizData is loaded and no submission result yet, display the quiz form
  return (
    <Layout>
      <div className="py-12 bg-quiz-light min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="quiz-card">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-quiz-light rounded-full flex items-center justify-center mb-4">
                <BookOpen className="h-8 w-8 text-quiz-primary" />
              </div>
              <h1 className="text-2xl font-bold gradient-text mb-2">Take Quiz</h1>
               {/* Display quiz details */}
               {quizData && (
                   <p className="text-gray-600">{quizData.quiz_type} Quiz - {quizData.subject} ({quizData.class})</p>
               )}
            </div>

            {/* Display the questions form */}
            {quizData?.questions.length === 0 ? (
                <div className="text-center text-gray-600">
                    <p>No questions found for this quiz.</p>
                </div>
            ) : (
                <form onSubmit={handleSubmitQuiz}> {/* Add the submit handler */}
                    <div className="space-y-6">
                        {quizData?.questions.map((question, index) => (
                            <div key={question.id} className="bg-white rounded-lg shadow p-6 border border-quiz-accent/30">
                                <p className="text-gray-800 font-medium mb-3">
                                    {index + 1}. {question.question}
                                </p>

                                {/* Render options for MCQ */}
                                {question.type === 'MCQ' && question.options && (
                                    <div className="space-y-2 mt-2">
                                        {question.options.map((option, optIndex) => (
                                            <div key={optIndex} className="flex items-center">
                                                <input
                                                    type="radio"
                                                    id={`q${question.id}-opt${optIndex}`}
                                                    name={`answer_${question.id}`}
                                                    value={option.split('.')[0]} // Store the letter (A, B, C, D)
                                                    className="text-quiz-primary focus:ring-quiz-primary"
                                                    // Add onChange handler
                                                    onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                                                    // Add checked prop controlled by userAnswers state
                                                    checked={userAnswers[question.id] === option.split('.')[0]}
                                                />
                                                <label htmlFor={`q${question.id}-opt${optIndex}`} className="ml-2 text-gray-700">
                                                    {option}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add input fields for FIB and Descriptive */}
                                {question.type === 'FIB' && (
                                    <div className="mt-2">
                                         <input
                                            type="text"
                                            name={`answer_${question.id}`}
                                            placeholder="Enter your answer"
                                            className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                                            // Add onChange handler and value prop
                                            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                                            value={userAnswers[question.id] || ''} // Control the input value
                                        />
                                    </div>
                                )}

                                {question.type === 'Descriptive' && (
                                    <div className="mt-2">
                                        <textarea
                                            name={`answer_${question.id}`}
                                            rows={4}
                                            placeholder="Write your detailed answer here..."
                                            className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                                            // Add onChange handler and value prop
                                            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                                            value={userAnswers[question.id] || ''} // Control the textarea value
                                        ></textarea>
                                    </div>
                                )}

                            </div>
                        ))}
                    </div>

                    <div className="mt-8 mb-6 p-6 border rounded-lg shadow-sm bg-white">
                        <label className="block text-lg font-semibold mb-3">Upload Reference PDF (Optional for Descriptive Questions)</label>
                        <input
                            type="file"
                            name="pdfFile" // IMPORTANT: Name MUST match 'pdfFile' in backend Multer config
                            ref={pdfFileRef} // Attach the ref
                            accept=".pdf" // Only allow PDF files
                            className="block w-full text-sm text-gray-500
                                                        file:mr-4 file:py-2 file:px-4
                                                        file:rounded-full file:border-0
                                                        file:text-sm file:font-semibold
                                                        file:bg-quiz-light file:text-quiz-primary
                                                        hover:file:bg-quiz-accent/30"
                                                    />
                                                    <p className="mt-2 text-sm text-gray-600">Upload a PDF that contains information relevant to the descriptive questions for potentially better AI evaluation.</p>
                     </div>
                                               

                    {/* Submission button */}
                    <div className="mt-6 text-center">
                        <button
                            type="submit"
                            className="quiz-button"
                            disabled={isSubmitting || !quizData} // Disable if submitting or no quiz data
                        >
                           {isSubmitting ? (
                                <>
                                    <Loader className="animate-spin mr-2 h-4 w-4" />
                                    Submitting...
                                </>
                            ) : (
                                'Submit Quiz'
                            )}
                        </button>
                    </div>
                </form>
            )}
          </div>
        </div>
      </div>
      <div className="mt-6 text-center">
        <button className="quiz-button-secondary" onClick={() => navigate('/profile')}
        >
            Back to Profile
        </button>
      </div>
      {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
    </Layout>
  );
};

export default TakeQuiz;
import React, { useEffect, useState, useRef, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Loader, BookOpen } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { useAuth } from '../context/AuthContext';

// Interfaces
interface Question {
  id: string;
  question: string;
  type: 'MCQ' | 'FIB' | 'Descriptive';
  options?: string[];
  answer: string;
  explanation: string;
}

interface QuizData {
  id: string;
  quiz_type: string;
  class: string;
  curriculum: string;
  subject: string;
  chapters: string;
  questions: Question[];
}

interface EvaluationResult {
  id?: number;
  type: 'MCQ' | 'FIB' | 'Descriptive';
  explanation: string;
  score?: number;
  feedback?: string;
  correct_parts?: string;
  improvements?: string;
  user_answer: string;
  correct_answer: string;
  is_correct?: boolean;
  question: string;
}

interface SubmissionResponse {
  score: number;
  results: EvaluationResult[];
  message?: string;
  error?: string;
}

const TakeQuiz = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<{ [questionId: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResponse | null>(null);

  const { toast } = useToast();
  const { token, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const pdfFileRef = useRef<HTMLInputElement>(null);
  const backendUrl = 'http://localhost:3001';

  useEffect(() => {
    if (!isLoggedIn && !token) {
      setError("You must be logged in to view a quiz.");
      setIsLoading(false);
      setTimeout(() => navigate('/login'), 2000);
      return;
    }

    const fetchQuiz = async () => {
      try {
        if (!quizId || !token) {
          setIsLoading(false);
          return;
        }

        const response = await fetch(`${backendUrl}/quiz/${quizId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch quiz: ${response.status} ${errorText}`);
        }

        const data: QuizData = await response.json();
        setQuizData(data);

        const initialAnswers: { [questionId: string]: string } = {};
        data.questions.forEach(q => initialAnswers[q.id] = '');
        setUserAnswers(initialAnswers);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        if (errorMessage.includes('401') || errorMessage.includes('403')) {
          setError("Authentication failed. Please log in again.");
          setTimeout(() => navigate('/login'), 2000);
        } else {
          setError(errorMessage);
        }
        toast({
          title: "Error loading quiz",
          description: "Could not retrieve the quiz questions.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (quizId && token && isLoading) {
      fetchQuiz();
    } else if (!quizId) {
      setError("No Quiz ID provided in the URL.");
      setIsLoading(false);
    }
  }, [quizId, token, toast, isLoggedIn, navigate, isLoading]);

  const handleAnswerChange = (questionId: string, value: string) => {
    setUserAnswers(prev => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleSubmitQuiz = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!quizId || !token) {
      setError("Cannot submit quiz: Quiz ID or authentication token is missing.");
      setIsSubmitting(false);
      if (!token) navigate('/login');
      return;
    }

    const formData = new FormData();
    Object.keys(userAnswers).forEach(questionId => {
      formData.append(`answer_${questionId}`, userAnswers[questionId]);
    });

    if (pdfFileRef.current?.files?.[0]) {
      formData.append('pdfFile', pdfFileRef.current.files[0]);
    }

    try {
      const response = await fetch(`${backendUrl}/submit-quiz/${quizId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit quiz for evaluation.');
      }

      setSubmissionResult(result);
      toast({
        title: "Submission Successful!",
        description: result.message || "Your quiz has been submitted and evaluated.",
      });

    } catch (err) {
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

  // Conditional Render
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
  
                            {/* Display Areas for Improvement if provided */}
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
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">
                        Evaluation details not available for this question type.
                      </p>
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
                <p className="text-gray-600">
                  {quizData.quiz_type} Quiz - {quizData.subject} ({quizData.class})
                </p>
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
                                onChange={(e) => handleAnswerChange(question.id, e.target.value)}
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
                            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                            value={userAnswers[question.id] || ''}
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
                            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                            value={userAnswers[question.id] || ''}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
  
                {/* Upload Reference PDF */}
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
                  <p className="mt-2 text-sm text-gray-600">
                    Upload a PDF that contains information relevant to the descriptive questions for potentially better AI evaluation.
                  </p>
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
        <button className="quiz-button-secondary" onClick={() => navigate('/profile')}>
          Back to Profile
        </button>
      </div>
      {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
    </Layout>
  );
  };
  
  export default TakeQuiz;
  
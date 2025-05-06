
import React, { useState, FormEvent } from 'react';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/use-toast';
import { BookOpen, CheckCircle, FileQuestion, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const GenerateQuiz = () => {
  const [formData, setFormData] = useState({
    quiz_type: 'MCQ',
    class: '',
    curriculum: '',
    subject: '',
    chapters: '',
    num_questions: 5,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { token } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === 'num_questions' ? parseInt(value) : value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    // Check if API key is set before attempting to generate quiz
         // You might want a more robust check, e.g., fetching from localStorage
         // or checking a context/state that confirms key setup.
         // For now, a basic localStorage check based on your ApiKeySetup.tsx:
    const apiKeySet = localStorage.getItem('user_id');
    if (!apiKeySet) {
      setError('Please set your AI connection key first.');
      setIsLoading(false);
      navigate('/set-api-key');
      return;
    }
    
    try {
      const response = await fetch('http://localhost:3001/generate-quiz', { // <--- Use the full backend URL
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${token}`,
        },
        body: new URLSearchParams(formData as any),
      });
    
    // Note: Your backend currently sends a simple JSON message.
    // It will need to return the quizId in the JSON response later.
    // For now, we'll just check if the response is OK.
    if (response.ok) {
             // Backend currently returns { message: '...' }
             // When backend generates and saves quiz, it will return { success: true, quizId: '...' }
             // Let's parse the response as JSON to be ready for the actual quizId
             const result = await response.json();
    
             if (result.success && result.quizId) {
              toast({
                title: "Quiz Generated!",
                description: "Your quiz is ready to take.",
                variant: "default",
              });
    
    // Navigate to the take quiz page using the received quizId
    navigate(`/take-quiz/${result.quizId}`);
  } else {
                // Handle cases where backend might return OK but with an error message in JSON
                 const errorData = result.error || 'Failed to generate quiz.';
                 setError(errorData);
                 toast({
                     title: "Generation Failed",
                     description: errorData,
                     variant: "destructive",
                 });
             }
    
    } else {
      const text = await response.text();
      throw new Error(text || 'Failed to generate quiz');
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'An unknown error occurred');
    toast({
      title: "Generation Failed",
      description: "Could not create your quiz. Please try again.",
      variant: "destructive",
    });
  } finally {
    setIsLoading(false);
  }
};

  return (
    <Layout>
      <div className="py-12 bg-quiz-light min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="quiz-card">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-quiz-light rounded-full flex items-center justify-center mb-4">
                <FileQuestion className="h-8 w-8 text-quiz-primary" />
              </div>
              <h1 className="text-2xl font-bold gradient-text mb-2">Generate Quiz</h1>
              <p className="text-gray-600">Create the perfect quiz for your learning needs</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quiz Type
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <label className={`border rounded-md p-4 flex items-center cursor-pointer ${formData.quiz_type === 'MCQ' ? 'bg-quiz-light border-quiz-primary' : 'bg-white border-gray-200'}`}>
                      <input
                        type="radio"
                        name="quiz_type"
                        value="MCQ"
                        checked={formData.quiz_type === 'MCQ'}
                        onChange={handleChange}
                        className="sr-only"
                      />
                      <CheckCircle className={`h-5 w-5 ${formData.quiz_type === 'MCQ' ? 'text-quiz-primary' : 'text-gray-300'}`} />
                      <span className="ml-2 text-sm font-medium">Multiple Choice</span>
                    </label>
                    <label className={`border rounded-md p-4 flex items-center cursor-pointer ${formData.quiz_type === 'FIB' ? 'bg-quiz-light border-quiz-primary' : 'bg-white border-gray-200'}`}>
                      <input
                        type="radio"
                        name="quiz_type"
                        value="FIB"
                        checked={formData.quiz_type === 'FIB'}
                        onChange={handleChange}
                        className="sr-only"
                      />
                      <CheckCircle className={`h-5 w-5 ${formData.quiz_type === 'FIB' ? 'text-quiz-primary' : 'text-gray-300'}`} />
                      <span className="ml-2 text-sm font-medium">Fill in the Blanks</span>
                    </label>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="class" className="block text-sm font-medium text-gray-700 mb-1">
                      Class/Grade
                    </label>
                    <input
                      type="text"
                      id="class"
                      name="class"
                      value={formData.class}
                      onChange={handleChange}
                      placeholder="e.g., 10th Grade, College Year 1"
                      className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="curriculum" className="block text-sm font-medium text-gray-700 mb-1">
                      Curriculum
                    </label>
                    <input
                      type="text"
                      id="curriculum"
                      name="curriculum"
                      value={formData.curriculum}
                      onChange={handleChange}
                      placeholder="e.g., CBSE, AP, IB"
                      className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder="e.g., Physics, World History, Mathematics"
                    className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="chapters" className="block text-sm font-medium text-gray-700 mb-1">
                    Chapters/Topics
                  </label>
                  <textarea
                    id="chapters"
                    name="chapters"
                    value={formData.chapters}
                    onChange={handleChange}
                    rows={3}
                    placeholder="e.g., Electromagnetism, Newton's Laws of Motion"
                    className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="num_questions" className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Questions
                  </label>
                  <input
                    type="number"
                    id="num_questions"
                    name="num_questions"
                    value={formData.num_questions}
                    onChange={handleChange}
                    min={1}
                    max={20}
                    className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">Choose between 1 and 20 questions</p>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="quiz-button w-full flex items-center justify-center"
                >
                  {isLoading ? (
                    <>
                      <Loader className="animate-spin mr-2 h-4 w-4" />
                      Generating Quiz...
                    </>
                  ) : (
                    <>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Generate Quiz
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default GenerateQuiz;

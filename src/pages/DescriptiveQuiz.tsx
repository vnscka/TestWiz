
import React, { useState, FormEvent } from 'react';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/use-toast';
import { BookOpen, FileText, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DescriptiveQuiz = () => {
  const [formData, setFormData] = useState({
    class: '',
    curriculum: '',
    subject: '',
    chapters: '',
    num_questions: 3,
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
    
        try {
          const response = await fetch('http://localhost:3001/descriptive-quiz', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Bearer ${token}`,
            },
            body: new URLSearchParams(formData as any),
          });
    
          if (response.ok) {
            
             const result = await response.json(); // Assuming backend sends JSON with success and quizId
    
            toast({
              title: "Descriptive Quiz Generated!",
              description: "Your quiz is ready to take.",
              variant: "default",
            });
    
             // >>> Add this console log <<<
             console.log("Descriptive Quiz Generated with ID:", result.quizId);
             // >>> End of console log <<<
    
            if (result.success && result.quizId) {
              navigate(`/take-quiz/${result.quizId}`); // Navigate to the standard TakeQuiz route
            } else {
                // Handle case where backend returns ok but no success/quizId
                console.error("Backend did not return success: true and quizId");
                setError("Failed to get quiz ID from backend.");
                toast({
                    title: "Generation Error",
                    description: "Backend did not provide quiz ID.",
                    variant: "destructive",
                });
              navigate('/'); // Fallback navigation
            }
          } else {
              // Handle non-ok responses (e.g., 400, 500 errors from backend)
              const errorData = await response.json(); // Assuming backend sends JSON error
              const errorMessage = errorData.error || `Error: ${response.statusText}`;
            setError(errorMessage);
            toast({
              title: "Generation Failed",
              description: errorMessage,
              variant: "destructive",
            });
          }
        } catch (err) {
            // Handle network errors or errors during json parsing etc.
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
          toast({
            title: "Connection Error",
            description: "Could not connect to the backend or process response.",
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
                <FileText className="h-8 w-8 text-quiz-primary" />
              </div>
              <h1 className="text-2xl font-bold gradient-text mb-2">Generate Descriptive Quiz</h1>
              <p className="text-gray-600">Create essay-type questions for in-depth learning</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
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
                    placeholder="e.g., Literature, History, Philosophy"
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
                    placeholder="e.g., Shakespeare's Hamlet, French Revolution"
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
                    max={5}
                    className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">For descriptive questions, we recommend 1-5 questions</p>
                </div>

                <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
                  <p className="font-medium mb-1">About Descriptive Quizzes</p>
                  <p>Descriptive questions require longer, essay-style answers. Our AI will evaluate your responses based on accuracy, completeness, and clarity.</p>
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
                      Generating Descriptive Quiz...
                    </>
                  ) : (
                    <>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Generate Descriptive Quiz
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

export default DescriptiveQuiz;

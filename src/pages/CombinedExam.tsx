
import React, { useState, FormEvent } from 'react';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/use-toast';
import { BookOpen, Files, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const CombinedExam = () => {
  const [formData, setFormData] = useState({
    class: '',
    curriculum: '',
    subject: '',
    chapters: '',
    num_mcq: 0,
    num_fib: 0,
    num_descriptive: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { token } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
     const { name, value } = e.target;
     setFormData((prev) => ({
            ...prev,
            [name]: ['num_mcq', 'num_fib', 'num_descriptive'].includes(name) ? parseInt(value) || 0 : value // <-- Update this list
        }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('http://localhost:3001/combined-exam', {
        method: 'POST',
         headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${token}`,
        },
        body: new URLSearchParams(formData as any),
    });
    
    if (response.ok) {
       // Parse the JSON response from the backend
       const result = await response.json(); // <--- Parse JSON response
       
       toast({
        title: "Combined Exam Generated!",
        description: "Your comprehensive exam is ready to take.",
        variant: "default",
      });
      
      // Check for success and quizId in the parsed result
      if (result.success && result.quizId) {

      navigate(`/take-quiz/${result.quizId}`); 
    } else {
      console.error("Backend did not return success: true and quizId");
      setError("Failed to get exam ID from backend.");
      toast({
        title: "Generation Error",
        description: "Backend did not provide exam ID.",
        variant: "destructive",
      });
      navigate('/'); 
    }
  } else {
    const errorData = await response.json();
    const errorMessage = errorData.error || `Error: ${response.statusText}`;
    setError(errorMessage);
    toast({
      title: "Generation Failed",
      description: errorMessage,
      variant: "destructive",
    });
  }
} catch (err) {
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
                <Files className="h-8 w-8 text-quiz-primary" />
              </div>
              <h1 className="text-2xl font-bold gradient-text mb-2">Create Combined Exam</h1>
              <p className="text-gray-600">Generate a comprehensive exam with multiple question types</p>
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
                    placeholder="e.g., Biology, Chemistry, Mathematics"
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
                    placeholder="e.g., Cell Biology, Genetics, Photosynthesis"
                    className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                    required
                  />
                </div>

                <div className="bg-amber-50 rounded-lg p-4 mb-4">
                  <h3 className="font-medium text-amber-800 mb-2">Number of Questions by Type</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="num_mcq" className="block text-sm font-medium text-gray-700 mb-1">
                        Multiple Choice
                      </label>
                      <input
                        type="number"
                        id="num_mcq"
                        name="num_mcq"
                        value={formData.num_mcq}
                        onChange={handleChange}
                        min={0}
                        max={10}
                        className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                        required
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="num_fib" className="block text-sm font-medium text-gray-700 mb-1">
                        Fill in Blanks
                      </label>
                      <input
                        type="number"
                        id="num_fib"
                        name="num_fib"
                        value={formData.num_fib}
                        onChange={handleChange}
                        min={0}
                        max={10}
                        className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                        required
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="num_descriptive" className="block text-sm font-medium text-gray-700 mb-1">
                        Descriptive
                      </label>
                      <input
                        type="number"
                        id="num_descriptive"
                        name="num_descriptive"
                        value={formData.num_descriptive}
                        onChange={handleChange}
                        min={0}
                        max={5}
                        className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                        required
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-amber-700">You can set any question type to 0 if you don't want to include it</p>
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
                      Creating Combined Exam...
                    </>
                  ) : (
                    <>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Create Combined Exam
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

export default CombinedExam;

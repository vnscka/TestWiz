import React, { useState, FormEvent } from 'react';
import Layout from '../components/Layout'; // Assuming you have a Layout component
import { useNavigate } from 'react-router-dom'; // To navigate after successful registration
import { useToast } from '../hooks/use-toast'; // Assuming you use a toast notification system
import { Loader, UserPlus } from 'lucide-react'; // Icons

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // Use string | null for error state

  const navigate = useNavigate();
  const { toast } = useToast(); // Initialize toast hook

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null); // Clear previous errors

    try {
      const response = await fetch('http://localhost:3001/register', { // Targeting the backend /register endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded', // Backend expects this format
        },
        // Send form data as URLSearchParams
        body: new URLSearchParams(formData).toString(),
      });

      if (response.ok) {
        // Registration successful
        const result = await response.json();
        toast({
          title: "Registration Successful!",
          description: result.message || "Your account has been created.",
          variant: "default",
        });
        // Optional: Redirect to login page after successful registration
        navigate('/login'); // Assuming you will create a /login route
      } else {
        // Handle errors (e.g., username already exists, validation errors from backend)
        const errorData = await response.json();
        const errorMessage = errorData.error || `Registration failed: ${response.statusText}`;
        setError(errorMessage);
        toast({
          title: "Registration Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (err) {
      // Handle network errors or other exceptions
      console.error("Registration request error:", err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred during registration.');
      toast({
        title: "Registration Error",
        description: "Could not connect to the server or process registration.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false); // Stop loading regardless of outcome
    }
  };

  return (
    <Layout>
      <div className="py-12 bg-quiz-light min-h-screen flex items-center justify-center"> {/* Centering the card */}
        <div className="max-w-sm w-full px-4 sm:px-6 lg:px-8"> {/* Smaller max width */}
          <div className="quiz-card"> {/* Reusing quiz-card styling */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-quiz-light rounded-full flex items-center justify-center mb-4">
                <UserPlus className="h-8 w-8 text-quiz-primary" /> {/* Registration Icon */}
              </div>
              <h1 className="text-2xl font-bold gradient-text mb-2">Create Account</h1>
              <p className="text-gray-600">Sign up to save your quizzes and results</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="quiz-button w-full flex items-center justify-center"
                >
                  {isLoading ? (
                    <>
                      <Loader className="animate-spin mr-2 h-4 w-4" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Register
                    </>
                  )}
                </button>
              </div>

             {/* Link to login page */}
             <p className="mt-4 text-center text-sm text-gray-600">
                 Already have an account?{' '}
                 <button
                     type="button"
                     onClick={() => navigate('/login')} // Assuming you will add a /login route
                     className="font-medium text-quiz-primary hover:text-quiz-primary-dark"
                 >
                     Login
                 </button>
             </p>

            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Register;
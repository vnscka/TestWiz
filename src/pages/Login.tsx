import React, { useState, FormEvent } from 'react';
import Layout from '../components/Layout'; // Assuming you have a Layout component
import { useNavigate } from 'react-router-dom'; // To navigate after successful login
import { useToast } from '../hooks/use-toast'; // Assuming you use a toast notification system
import { Loader, LogIn } from 'lucide-react'; // Icons
import { useAuth } from '../context/AuthContext'; // <--- Import the useAuth hook

const Login = () => {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { toast } = useToast();
    const { login } = useAuth();
    // Handle input changes
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    // Handle form submission
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        
        try {
            const response = await fetch('http://localhost:3001/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams(formData).toString(),
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Check if the backend returned a token and user info
                if (result.token && result.user) {
                            // Use the login function from AuthContext
                            login(result.token, result.user); // <--- Call login function to save token/user and update state
                
                            toast({
                                title: "Login Successful!",
                                description: result.message || "Welcome back!",
                                variant: "default",
                            });
                
                            // Redirect to the API key setup page after successful login
                            navigate('/set-api-key'); // <--- Redirect
                
                } else {
                             // Handle case where backend success but didn't return expected data
                             const errorMessage = "Login successful, but missing token or user data.";
                             setError(errorMessage);
                             toast({
                                 title: "Login Error",
                                 description: errorMessage,
                                 variant: "destructive",
                             });
                        }
                
                } else {
                    // Handle errors (e.g., invalid credentials)
                    const errorData = await response.json();
                    const errorMessage = errorData.error || `Login failed: ${response.statusText}`;
                    setError(errorMessage);
                    toast({
                        title: "Login Failed",
                        description: errorMessage,
                        variant: "destructive",
                    });
                    }
                } catch (err) {
                    // Handle network errors or other exceptions
                    console.error("Login request error:", err);
                    setError(err instanceof Error ? err.message : 'An unknown error occurred during login.');
                    toast({
                        title: "Login Error",
                        description: "Could not connect to the server or process login.",
                        variant: "destructive",
                    });
                } finally {
                    setIsLoading(false);
                }
                };

  return (
    <Layout>
      {/* Reuse similar styling as Register page */}
      <div className="py-12 bg-quiz-light min-h-screen flex items-center justify-center">
        <div className="max-w-sm w-full px-4 sm:px-6 lg:px-8">
          <div className="quiz-card">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-quiz-light rounded-full flex items-center justify-center mb-4">
                <LogIn className="h-8 w-8 text-quiz-primary" /> {/* Login Icon */}
              </div>
              <h1 className="text-2xl font-bold gradient-text mb-2">Welcome Back!</h1>
              <p className="text-gray-600">Login to access your account</p>
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
                      Logging In...
                    </>
                  ) : (
                    <>
                      <LogIn className="mr-2 h-4 w-4" />
                      Login
                    </>
                  )}
                </button>
              </div>

             {/* Link to registration page */}
             <p className="mt-4 text-center text-sm text-gray-600">
                 Don't have an account?{' '}
                 <button
                     type="button"
                     onClick={() => navigate('/register')} // Link back to the /register route
                     className="font-medium text-quiz-primary hover:text-quiz-primary-dark"
                 >
                     Register
                 </button>
             </p>

            </form>
            </div>
        </div>
      </div>
    </Layout>
  );
};

export default Login;
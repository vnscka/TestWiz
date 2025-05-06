import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Brain, Key, Sparkles } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { useAuth } from '../context/AuthContext';

const ApiKeySetup = () => {
    const [apiKey, setApiKey] = useState('');
    const [apiType, setApiType] = useState('Gemini');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { toast } = useToast();
    const { token } = useAuth();
    
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // Basic validation
    if (!apiKey) {
        toast({
            title: "Missing API Key",
            description: "Please enter your API key.",
            variant: "destructive",
        });
        setIsLoading(false);
        return;
    }
    if (!token) {
         toast({
            title: "Authentication Error",
            description: "You must be logged in to set an API key.",
            variant: "destructive",
         });
         setIsLoading(false);
         // Optionally redirect to login
         navigate('/login');
         return;
    }
    
    try {
        const response = await fetch('http://localhost:3001/set-api-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${token}`,
            },
            body: new URLSearchParams({ apiKey, apiType }).toString(),
        });

        if (response.ok) {
            toast({
                title: "API Key Set!",
                description: `Your ${apiType} API key has been saved securely.`,
                variant: "default",
            });

            navigate('/generate-quiz');
        } else {
            const errorData = await response.json();
            const errorMessage = errorData.error || `Failed to set API key: ${response.statusText}`;
            toast({
                title: "Error Setting API Key",
                description: errorMessage,
                variant: "destructive",
            });
        }
     } catch (err) {
        console.error("Set API Key request error:", err);
        toast({
            title: "Network Error",
            description: "Could not connect to the server or process the request.",
            variant: "destructive",
        });
    } finally {
        setIsLoading(false);
    }
};

  return (
    <Layout>
      <div className="py-12 bg-quiz-light min-h-[80vh] flex items-center">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
          <div className="quiz-card">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-quiz-light rounded-full flex items-center justify-center mb-4">
                <Key className="h-8 w-8 text-quiz-primary" />
              </div>
              <h1 className="text-2xl font-bold gradient-text mb-2">Connect to AI Wizards</h1>
              <p className="text-gray-600">Enter your key and select your AI to unlock the magic of Quiz Genie</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
                  {error}
                </div>
              )}
  
              <div className="space-y-2">
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700">
                  AI Connection Key
                </label>
                <div className="relative">
                  <input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-4 focus:ring-quiz-primary focus:border-quiz-primary"
                    placeholder="Enter your OpenAI or Gemini key"
                    required
                  />
                </div>
              </div>

              {/* API Type Selection */}
              <div className="space-y-2">
                <label htmlFor="apiType" className="block text-sm font-medium text-gray-700">
                  Select AI Model
                </label>
                <select
                  id="apiType"
                  name="apiType"
                  value={apiType}
                  onChange={(e) => setApiType(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 focus:ring-quiz-primary focus:border-quiz-primary"
                >
                  <option value="Gemini">Google Gemini</option>
                  <option value="OpenAI">OpenAI GPT</option>
                </select>
              </div>

              <div className="flex flex-col space-y-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="quiz-button w-full flex items-center justify-center"
                >
                  {isLoading ? 'Connecting...' : 'Connect to AI'}
                </button>
              </div>
            </form>

            <div className="mt-8 space-y-4">
              <div className="bg-blue-50 rounded-md p-4 flex items-start">
                <Brain className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="ml-3 text-sm text-blue-700">
                  <h4 className="font-medium">OpenAI Key</h4>
                  <p>Starts with 'sk-'. Get one from the OpenAI website.</p>
                </div>
              </div>

              <div className="bg-green-50 rounded-md p-4 flex items-start">
                <Sparkles className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="ml-3 text-sm text-green-700">
                  <h4 className="font-medium">Gemini Key</h4>
                  <p>Get one from the Google AI Studio website.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Add the React Warning Fix here if you like, e.g., in Index.tsx */}
      </div>
    </Layout>
  );
};

export default ApiKeySetup;
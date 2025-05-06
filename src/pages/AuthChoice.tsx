import React from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout'; // Assuming you use a Layout component
import { UserPlus, LogIn } from 'lucide-react'; // Icons for buttons

const AuthChoice = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="py-12 bg-quiz-light min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full px-4 sm:px-6 lg:px-8 text-center"> {/* Centering content */}
          <div className="quiz-card space-y-6 p-8"> {/* Reusing quiz-card styling, added spacing */}
            <div className="text-center">
              <h1 className="text-2xl font-bold gradient-text mb-4">Get Started</h1>
              <p className="text-gray-600">Choose an option to continue</p>
            </div>

            {/* Register Button */}
            <button
              onClick={() => navigate('/register')}
              className="quiz-button w-full flex items-center justify-center" // Full width button
            >
              <UserPlus className="mr-2 h-5 w-5" />
              Register
            </button>

            {/* Login Button */}
            <button
              onClick={() => navigate('/login')}
              className="quiz-button-secondary w-full flex items-center justify-center" // Secondary button style
            >
              <LogIn className="mr-2 h-5 w-5" />
              Login
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AuthChoice;
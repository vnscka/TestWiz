// frontend/src/components/Navbar.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Menu, User, X } from 'lucide-react'; // Import User icon (optional)

// You might need state or context here to check if the user is logged in
// For simplicity, let's add the link directly for now.

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false);

  // Function to check if user is logged in (example - implement based on your auth state)
  const isLoggedIn = () => {
      return !!localStorage.getItem('token'); // Check if token exists (adjust if you store token differently)
  };

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link to="/" className="flex-shrink-0 flex items-center">
            <BookOpen className="h-8 w-8 text-quiz-primary" />
            <span className="ml-2 font-bold text-xl text-quiz-dark">Quiz Genie Academy</span>
            </Link>
          </div>
          <div className="hidden md:ml-6 md:flex md:items-center md:space-x-4">
            <Link to="/" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-quiz-primary">
              Home
            </Link>
            <Link to="/generate-quiz" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-quiz-primary">
              Generate Quiz
            </Link>
            <Link to="/descriptive-quiz" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-quiz-primary">
              Descriptive Quiz
            </Link>
            <Link to="/combined-exam" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-quiz-primary">
              Combined Exam
            </Link>
            <Link to="/chatbot" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-quiz-primary">
             Assistant
            </Link>

            {/* --- Add Profile Link AND Conditional Rendering here (Desktop) --- */}
            {isLoggedIn() ? ( // Conditionally render if logged in (example check)
              <Link to="/profile" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-quiz-primary flex items-center">
                 <User className="h-4 w-4 mr-1" /> {/* Optional: User icon */}
                 Profile
              </Link>
            ) : (
              // Optional: Add Login/Register links if not logged in
              <>
                <Link to="/login" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-quiz-primary">
                   Login
                </Link>
                 <Link to="/register" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-quiz-primary">
                   Register
                </Link>
              </>
            )}
            {/* --------------------------------------------------------- */}

          </div>
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-quiz-primary hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-quiz-primary"
            >
              <span className="sr-only">Open main menu</span>
              {isOpen ? <X className="block h-6 w-6" /> : <Menu className="block h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu, show/hide based on menu state */}
      {isOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link to="/" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-quiz-primary hover:bg-gray-100">
              Home
            </Link>
            <Link to="/generate-quiz" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-quiz-primary hover:bg-gray-100">
              Generate Quiz
            </Link>
            <Link to="/descriptive-quiz" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-quiz-primary hover:bg-gray-100">
              Descriptive Quiz
            </Link>
            <Link to="/combined-exam" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-quiz-primary hover:bg-gray-100">
              Combined Exam
            </Link>
            <Link to="/chatbot" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-quiz-primary hover:bg-gray-100">
             Assistant
            </Link>

             {/* --- Add Profile Link AND Conditional Rendering here (Mobile) --- */}
             {isLoggedIn() ? ( // Conditionally render if logged in (example check)
               <Link to="/profile" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-quiz-primary hover:bg-gray-100 flex items-center">
                  <User className="h-5 w-5 mr-2" /> {/* Optional: User icon */}
                  Profile
               </Link>
             ) : (
               // Optional: Add Login/Register links if not logged in
               <>
                 <Link to="/login" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-quiz-primary hover:bg-gray-100">
                    Login
                 </Link>
                  <Link to="/register" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-quiz-primary hover:bg-gray-100">
                    Register
                 </Link>
               </>
             )}
             {/* ---------------------------------------------------------- */}

          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
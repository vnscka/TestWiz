
import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-gray-200 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <h3 className="text-lg font-semibold gradient-text">Quiz Genie Academy</h3>
            <p className="text-sm text-gray-500 mt-1">Magical quizzes co-powered by Gemini and OpenAI</p>
          </div>
          <div className="flex space-x-6">
            <a href="#" className="text-gray-500 hover:text-quiz-primary">
              Privacy Policy
            </a>
            <a href="#" className="text-gray-500 hover:text-quiz-primary">
              Terms of Service
            </a>
            <a href="#" className="text-gray-500 hover:text-quiz-primary">
              Contact Us
            </a>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-200 pt-4">
          <p className="text-sm text-center text-gray-500">© {new Date().getFullYear()} Quiz Genie Academy. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;


import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Brain, CheckCircle, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';

const Index = () => {
  return (
    <Layout>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-quiz-light py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              <span className="gradient-text">Quiz Genie Academy</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              Create tailored educational quizzes with the magic of AI. Perfect for students, teachers, and lifelong learners.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
            <Link to="/welcome" className="border border-quiz-primary text-quiz-primary font-medium py-2 px-6 rounded-lg hover:bg-quiz-light transition-all duration-300">
                Get Started
              </Link>
              <Link to="/generate-quiz" className="border border-quiz-primary text-quiz-primary font-medium py-2 px-6 rounded-lg hover:bg-quiz-light transition-all duration-300">
                Explore Quizzes
              </Link>
            </div>
          </div>
          
          <div className="mt-16 animate-fade-in">
            <div className="relative max-w-lg mx-auto">
              <div className="bg-white rounded-xl shadow-lg p-6 border border-quiz-accent/30">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center">
                    <BookOpen className="h-6 w-6 text-quiz-primary" />
                    <span className="ml-2 font-medium">Physics Quiz</span>
                  </div>
                  <span className="text-sm text-gray-500">Grade 10</span>
                </div>
                <p className="text-gray-700 mb-4">What is the SI unit of electric current?</p>
                <div className="space-y-2">
                  <div className="flex items-center p-2 rounded-md hover:bg-quiz-light">
                    <input type="radio" id="opt1" name="answer" className="text-quiz-primary focus:ring-quiz-primary" />
                    <label htmlFor="opt1" className="ml-2 text-gray-700">A. Volt</label>
                  </div>
                  <div className="flex items-center p-2 rounded-md hover:bg-quiz-light">
                    <input type="radio" id="opt2" name="answer" className="text-quiz-primary focus:ring-quiz-primary" />
                    <label htmlFor="opt2" className="ml-2 text-gray-700">B. Watt</label>
                  </div>
                  <div className="flex items-center p-2 rounded-md bg-quiz-light">
                    <input type="radio" id="opt3" name="answer" className="text-quiz-primary focus:ring-quiz-primary" readOnly />
                    <label htmlFor="opt3" className="ml-2 text-gray-700 font-medium">C. Ampere</label>
                  </div>
                  <div className="flex items-center p-2 rounded-md hover:bg-quiz-light">
                    <input type="radio" id="opt4" name="answer" className="text-quiz-primary focus:ring-quiz-primary" />
                    <label htmlFor="opt4" className="ml-2 text-gray-700">D. Ohm</label>
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <button className="quiz-button">Next Question</button>
                </div>
              </div>
              <div className="absolute -top-4 -right-4 h-12 w-12 bg-quiz-gold rounded-full flex items-center justify-center shadow-lg animate-float">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold gradient-text mb-2">Why Choose Quiz Genie?</h2>
            <p className="text-gray-600">Revolutionize your learning experience with AI-powered quizzes</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="quiz-card text-center">
              <div className="w-12 h-12 mx-auto bg-quiz-light rounded-full flex items-center justify-center mb-4">
                <Brain className="h-6 w-6 text-quiz-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI-Powered</h3>
              <p className="text-gray-600">Our quizzes are powered by a versatile self-hosted AI, ensuring high-quality, relevant content tailored to your curriculum.</p>
            </div>
            
            <div className="quiz-card text-center">
              <div className="w-12 h-12 mx-auto bg-quiz-light rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-6 w-6 text-quiz-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Customizable</h3>
              <p className="text-gray-600">Create quizzes for any subject, class, or curriculum with multiple question types to test different skills.</p>
            </div>
            
            <div className="quiz-card text-center">
              <div className="w-12 h-12 mx-auto bg-quiz-light rounded-full flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-quiz-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Detailed Feedback</h3>
              <p className="text-gray-600">Receive comprehensive feedback and explanations to help you understand concepts better and improve.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-quiz-primary to-quiz-secondary py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Transform Your Learning?</h2>
          <p className="text-white/90 text-lg mb-8 max-w-2xl mx-auto">
            Connect with our AI wizards and start creating magical quizzes tailored to your needs.
          </p>
          <Link to="/welcome" className="bg-white text-quiz-primary font-medium py-2 px-8 rounded-lg hover:shadow-lg transition-all duration-300">
            Get Started Now
          </Link>
        </div>
      </section>
    </Layout>
  );
};

export default Index;

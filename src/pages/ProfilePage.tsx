// frontend/src/pages/ProfilePage.tsx
import React, { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom'; // Import Link for navigation
import Layout from '../components/Layout'; // Import your Layout component
import { BookOpen, CheckCircle } from 'lucide-react'; // Optional: Import icons for lists

// Define interfaces for the data we expect from the backend (keep these as they are)
interface UserProfile {
  id: number;
  username: string;
}

interface QuizSummary {
  id: string; // Quiz ID (UUID)
  quiz_type: string;
  class: string;
  curriculum: string;
  subject: string;
  chapters: string;
  created_at: string; // Timestamp string
}

interface ResultSummary {
  curriculum: ReactNode;
  result_id: string; // Result ID (UUID)
  quiz_id: string; // Associated Quiz ID
  score: number; // Percentage score
  submitted_at: string; // Timestamp string
  quiz_type: string; // From the join
  class: string; // From the join
  subject: string; // From the join
  chapters: string; // From the join
}

const ProfilePage: React.FC = () => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [results, setResults] = useState<ResultSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = 'http://localhost:3001'; // Make sure this matches your backend URL

  // Data fetching logic (keep this the same)
  useEffect(() => {
    const fetchProfileData = async () => {
      const token = localStorage.getItem('token'); // Get token from storage

      if (!token) {
        setError('User not authenticated. Please log in.');
        setLoading(false);
        return;
      }

      try {
        const authHeaders = { 'Authorization': `Bearer ${token}` };

        // Fetch user profile
        const profileResponse = await fetch(`${backendUrl}/user/profile`, { headers: authHeaders });
        if (!profileResponse.ok) throw new Error(`Failed to fetch profile: ${profileResponse.status}`);
        setUserProfile(await profileResponse.json());

        // Fetch user quizzes
        const quizzesResponse = await fetch(`${backendUrl}/user/quizzes`, { headers: authHeaders });
        if (!quizzesResponse.ok) throw new Error(`Failed to fetch quizzes: ${quizzesResponse.status}`);
        setQuizzes(await quizzesResponse.json());

        // Fetch user results
        const resultsResponse = await fetch(`${backendUrl}/user/results`, { headers: authHeaders });
        if (!resultsResponse.ok) throw new Error(`Failed to fetch results: ${resultsResponse.status}`);
        setResults(await resultsResponse.json());

      } catch (err: any) {
        console.error("Error fetching profile data:", err);
        setError(err.message || 'An error occurred while fetching data.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, []); // Empty dependency array runs once on mount

  // --- Styled Rendering ---
  if (loading) {
    // Basic loading state styling
    return (
      <Layout>
        <div className="max-w-7xl mx-auto py-12 px-4 text-center">
          <p className="text-gray-600">Loading profile data...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    // Basic error state styling
    return (
       <Layout>
        <div className="max-w-7xl mx-auto py-12 px-4 text-center">
           <p className="text-red-500">Error: {error}</p>
        </div>
      </Layout>
    );
  }

  // Display fetched data with styling
  return (
    <Layout> {/* Wrap content in your Layout component */}
      <section className="py-12 bg-gradient-to-b from-white to-quiz-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Profile Info Section */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 gradient-text">
              {userProfile ? `${userProfile.username}'s Profile` : 'User Profile'}
            </h1>
            {userProfile && (
               <p className="text-lg text-gray-600">User ID: {userProfile.id}</p>
            )}
          </div>

          {/* Quizzes Section */}
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-center gradient-text">My Quizzes ({quizzes.length})</h2>
            {quizzes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {quizzes.map((quiz) => (
                  // Link each quiz item to the take quiz page
                  <Link to={`/take-quiz/${quiz.id}`} key={quiz.id} className="block quiz-card hover:shadow-xl transition-shadow duration-200">
                     <div className="flex items-center mb-2">
                       <BookOpen className="h-5 w-5 text-quiz-primary mr-2" /> {/* Example Icon */}
                       <h3 className="text-lg font-medium text-quiz-dark truncate">{quiz.subject} - {quiz.quiz_type}</h3>
                     </div>
                     <p className="text-gray-600 text-sm mb-1">Class: {quiz.class}, Curriculum: {quiz.curriculum}</p>
                     <p className="text-gray-600 text-sm mb-2">Chapters: {quiz.chapters}</p>
                     <p className="text-gray-500 text-xs">Created: {new Date(quiz.created_at).toLocaleString()}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-600">No quizzes generated yet. Go to "Generate Quiz" to create one!</p>
            )}
          </div>

          {/* Results Section */}
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-center gradient-text">My Results ({results.length})</h2>
             {results.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {results.map((result) => (
                  // Link each result item to the view result page
                  <Link to={`/user/results/${result.result_id}`} key={result.result_id} className="block quiz-card hover:shadow-xl transition-shadow duration-200">
                     <div className="flex items-center mb-2">
                       <CheckCircle className="h-5 w-5 text-green-600 mr-2" /> {/* Example Icon */}
                       <h3 className="text-lg font-medium text-quiz-dark truncate">{result.subject} - {result.quiz_type}</h3>
                     </div>
                     <p className="text-gray-600 text-sm mb-1">Class: {result.class}, Curriculum: {result.curriculum}</p>
                     <p className="text-gray-600 text-sm mb-2">Chapters: {result.chapters}</p>
                     <p className={`text-lg font-bold ${result.score >= 70 ? 'text-green-600' : result.score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>Score: {result.score.toFixed(2)}%</p> {/* Styled score */}
                     <p className="text-gray-500 text-xs">Submitted: {new Date(result.submitted_at).toLocaleString()}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-600">No quiz results submitted yet. Generate and take a quiz to see results!</p>
            )}
          </div>

        </div>
      </section>
    </Layout>
  );
};

export default ProfilePage;
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

// Define the shape of the authentication context state
interface AuthState {
  token: string | null; // Store the JWT token
  user: { id: string; username: string } | null; // Store basic user info (optional)
  isLoggedIn: boolean; // Derived state: true if token and user exist
  login: (token: string, user: { id: string; username: string }) => void; // Function to log in
  logout: () => void; // Function to log out
  loading: boolean; // To indicate if initial auth state is being loaded (e.g., from localStorage)
}

// Create the context with default values
const AuthContext = createContext<AuthState | undefined>(undefined);

// Create a provider component
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State to hold the token and user info
  // Initialize state by checking local storage for a saved token/user
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [loading, setLoading] = useState(true); // Start in loading state

  // Effect to run once on mount to check localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      try {
        // Attempt to parse stored user info
        const parsedUser = JSON.parse(storedUser);
        // Basic check for expected properties
        if (parsedUser && parsedUser.id && parsedUser.username) {
            setToken(storedToken);
            setUser(parsedUser);
            console.log("Loaded token and user from localStorage.");
        } else {
             // Clear invalid stored data
             localStorage.removeItem('token');
             localStorage.removeItem('user');
             console.warn("Invalid user data in localStorage. Cleared.");
        }
      } catch (e) {
          // Handle parsing errors
          console.error("Error parsing user data from localStorage:", e);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
      }
    }
    setLoading(false); // Finished loading initial state
  }, []); // Empty dependency array means this runs only once on mount

  // Function to handle login
  const login = (newToken: string, newUser: { id: string; username: string }) => {
    localStorage.setItem('token', newToken); // Store token in localStorage
    localStorage.setItem('user', JSON.stringify(newUser)); // Store user info (as string)
    setToken(newToken);
    setUser(newUser);
    console.log("User logged in. Token and user saved.");
  };

  // Function to handle logout
  const logout = () => {
    localStorage.removeItem('token'); // Remove token from localStorage
    localStorage.removeItem('user'); // Remove user info
    setToken(null);
    setUser(null);
    console.log("User logged out. Token and user removed.");
  };

  // Determine isLoggedIn state
  const isLoggedIn = !!token && !!user; // True if both token and user exist

  // Provide the state and functions through the context
  const authState: AuthState = {
    token,
    user,
    isLoggedIn,
    login,
    logout,
    loading,
  };

  return <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>;
};

// Custom hook to easily use the authentication context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
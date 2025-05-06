import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext'; // <--- Import AuthProvider

createRoot(document.getElementById("root")!).render(
  // You might also need React.StrictMode here if you use it
  // <React.StrictMode>
    <AuthProvider> {/* <--- Wrap your App with AuthProvider */}
      <App />
    </AuthProvider>
  // </React.StrictMode>
);
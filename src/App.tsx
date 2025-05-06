
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ProfilePage from "./pages/ProfilePage";
import ApiKeySetup from "./pages/ApiKeySetup";
import GenerateQuiz from "./pages/GenerateQuiz";
import DescriptiveQuiz from "./pages/DescriptiveQuiz";
import CombinedExam from "./pages/CombinedExam";
import Chatbot from "./pages/Chatbot";
import TakeQuiz from './pages/TakeQuiz';
import Register from './pages/Register';
import Login from './pages/Login';
import AuthChoice from './pages/AuthChoice';
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/welcome" element={<AuthChoice />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/set-api-key" element={<ApiKeySetup />} />
          <Route path="/generate-quiz" element={<GenerateQuiz />} />
          <Route path="/descriptive-quiz" element={<DescriptiveQuiz />} />
          <Route path="/combined-exam" element={<CombinedExam />} />
          <Route path="/chatbot" element={<Chatbot />} />
          <Route path="/take-quiz/:quizId" element={<TakeQuiz />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;


import React, { useState, useRef, useEffect } from 'react';
import Layout from '../components/Layout';
import { Send, Loader, User, Sparkles } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { useAuth } from '../context/AuthContext';

interface Message {
  content: string;
  type: 'user' | 'bot';
}

const Chatbot = () => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([{
    content: "Hello! I'm your AI study assistant. Ask me any questions about your subjects or topics you're learning about!",
    type: 'bot',
  }]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { token } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;
    
    const userMessage = message;
    setMessage('');
    
    // Add user message to chat
    setMessages((prev) => [...prev, { content: userMessage, type: 'user' }]);
    
    setIsLoading(true);
    
    try {
      const response = await fetch('http://localhost:3001/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${token}`,
        },
        body: new URLSearchParams({ message: userMessage }),
      });
      
      
      const data = await response.json();
      
      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }
      
      // Add bot response to chat
    setMessages((prev) => [...prev, { content: data.response, type: 'bot' }]);
  } catch (error) {
    toast({
      title: "Connection Error",
      description: "Failed to reach our AI wizards. Please try again.",
      variant: "destructive",
    });
  } finally {
    setIsLoading(false);
  }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-quiz-light py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="quiz-card min-h-[70vh] flex flex-col">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold gradient-text">AI Study Assistant</h1>
              <p className="text-gray-600">Ask questions about any topic to enhance your learning</p>
            </div>

            <div className="flex-grow overflow-y-auto mb-4 p-4 bg-quiz-light rounded-lg space-y-4">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.type === 'user'
                        ? 'bg-quiz-primary text-white'
                        : 'bg-white shadow border border-quiz-accent/30'
                    }`}
                  >
                    <div className="flex items-center mb-1">
                      {msg.type === 'bot' ? (
                        <Sparkles className="h-4 w-4 text-quiz-primary mr-1" />
                      ) : (
                        <User className="h-4 w-4 text-white mr-1" />
                      )}
                      <span className={`text-xs font-semibold ${msg.type === 'user' ? 'text-white' : 'text-quiz-primary'}`}>
                        {msg.type === 'user' ? 'You' : 'Quiz Genie'}
                      </span>
                    </div>
                    <p className={`text-sm whitespace-pre-wrap ${msg.type === 'bot' ? 'text-gray-800' : ''}`}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white shadow border border-quiz-accent/30 rounded-lg p-4">
                    <div className="flex items-center">
                      <Loader className="h-4 w-4 animate-spin text-quiz-primary" />
                      <span className="ml-2 text-sm text-gray-600">The AI wizard is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="mt-auto">
              <div className="relative">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ask anything about your studies..."
                  className="w-full border border-gray-300 rounded-lg py-3 pl-4 pr-12 focus:ring-quiz-primary focus:border-quiz-primary"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !message.trim()}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-white bg-quiz-primary p-2 rounded-full hover:bg-quiz-secondary transition-colors disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500 text-center">
                Powered by the magic of Gemini and OpenAI
              </p>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Chatbot;

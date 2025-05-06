
import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import { useLocation } from 'react-router-dom';
import { useToast } from '../hooks/use-toast';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { toast } = useToast();
  
  // Check if user needs to connect AI
  React.useEffect(() => {
    if (
      location.pathname !== '/' && 
      location.pathname !== '/set-api-key' && 
      !localStorage.getItem('user_id')
    ) {
      toast({
        title: "AI Connection Required",
        description: "Please connect to our AI wizards first.",
        variant: "destructive",
      });
    }
  }, [location.pathname]);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-grow">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;

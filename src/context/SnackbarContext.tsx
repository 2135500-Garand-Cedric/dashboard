"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface SnackbarContextType {
  showMessage: (message: string, duration?: number) => void;
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

export const SnackbarProvider = ({ children }: { children: ReactNode }) => {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const showMessage = (msg: string, duration = 3000) => {
    setMessage(msg);
    setVisible(true);

    // Fade out after duration
    setTimeout(() => setVisible(false), duration);
  };

  // Remove message from DOM after fade-out
  useEffect(() => {
    if (!visible && message) {
      const timer = setTimeout(() => setMessage(null), 300); // match transition duration
      return () => clearTimeout(timer);
    }
  }, [visible, message]);

  return (
    <SnackbarContext.Provider value={{ showMessage }}>
      {children}
      {message && (
        <div
          className={`
            fixed top-5 left-1/2 transform -translate-x-1/2
            bg-gray-800 text-white px-6 py-3 rounded-lg shadow-lg font-medium text-base
            transition-all duration-300 ease-in-out z-50
            ${visible ? "opacity-100 translate-y-0" : "opacity-0"}
          `}
          style={{ border: "1px solid var(--color-card-border)"} }
        >
          {message}
        </div>
      )}
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) throw new Error("useSnackbar must be used within a SnackbarProvider");
  return context;
};

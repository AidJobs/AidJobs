'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type AdminView = 'dashboard' | 'sources' | 'crawl' | 'find-earn' | 'taxonomy' | 'setup';

type AdminViewContextType = {
  currentView: AdminView;
  setCurrentView: (view: AdminView) => void;
};

const AdminViewContext = createContext<AdminViewContextType | undefined>(undefined);

export function AdminViewProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');

  return (
    <AdminViewContext.Provider value={{ currentView, setCurrentView }}>
      {children}
    </AdminViewContext.Provider>
  );
}

export function useAdminView() {
  const context = useContext(AdminViewContext);
  if (!context) {
    throw new Error('useAdminView must be used within AdminViewProvider');
  }
  return context;
}


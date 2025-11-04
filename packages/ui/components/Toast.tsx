import * as React from 'react';
import toast, { Toaster as HotToaster, Toast as HotToast } from 'react-hot-toast';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}

export function showToast({ message, type = 'info', duration = 3000 }: ToastProps) {
  switch (type) {
    case 'success':
      return toast.success(message, { duration });
    case 'error':
      return toast.error(message, { duration });
    default:
      return toast(message, { duration });
  }
}

export function ToastProvider() {
  return (
    <HotToaster
      position="bottom-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: 'hsl(var(--surface))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 'var(--radius)',
        },
        success: {
          iconTheme: {
            primary: 'hsl(var(--primary))',
            secondary: 'hsl(var(--primary-foreground))',
          },
        },
        error: {
          iconTheme: {
            primary: 'hsl(var(--danger))',
            secondary: 'hsl(var(--bg))',
          },
        },
      }}
    />
  );
}

export { toast };

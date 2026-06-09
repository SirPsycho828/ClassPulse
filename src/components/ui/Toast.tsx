import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    const duration = type === 'error' ? 10000 : type === 'info' ? 5000 : 3000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const borderColor = {
    success: 'border-l-green-600',
    error: 'border-l-red-600',
    info: 'border-l-blue-600',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`bg-card border border-border border-l-4 ${borderColor[t.type]} rounded-[--radius-md] shadow-lg p-3 flex items-start gap-2 animate-in slide-in-from-right`}
          >
            <p className="text-sm text-foreground flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-muted-foreground/70 hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

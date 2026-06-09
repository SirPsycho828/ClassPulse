import { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';

interface GuidanceTipProps {
  id: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export function GuidanceTip({ id, children, icon }: GuidanceTipProps) {
  const storageKey = `ux-tip-${id}`;
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(storageKey) === 'true'
  );

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(storageKey, 'true');
    setDismissed(true);
  }

  return (
    <div className="flex items-start gap-3 rounded-[--radius-md] border border-border bg-muted/50 p-3 text-sm animate-in fade-in duration-200">
      <span className="mt-0.5 shrink-0 text-accent">
        {icon ?? <Lightbulb className="h-4 w-4" />}
      </span>
      <p className="flex-1 text-muted-foreground">{children}</p>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-muted-foreground/70 hover:text-foreground transition-colors"
        aria-label="Dismiss tip"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

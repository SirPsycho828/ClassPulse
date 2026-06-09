import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface NextStepCardProps {
  title: string;
  description: string;
  to: string;
  actionLabel?: string;
  icon?: React.ReactNode;
}

export function NextStepCard({ title, description, to, actionLabel, icon }: NextStepCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-[--radius-md] border-l-4 border-l-primary bg-card p-4 shadow-[--shadow-sm]">
      {icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Link
        to={to}
        className="shrink-0 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        {actionLabel ?? title}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

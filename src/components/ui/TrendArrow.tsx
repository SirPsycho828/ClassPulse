import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Trend } from '@/lib/summaryTypes';

interface TrendArrowProps {
  trend: Trend;
  size?: number;
}

export function TrendArrow({ trend, size = 16 }: TrendArrowProps) {
  if (trend === 'up') {
    return <TrendingUp className="text-success" style={{ width: size, height: size }} />;
  }
  if (trend === 'down') {
    return <TrendingDown className="text-destructive" style={{ width: size, height: size }} />;
  }
  return <Minus className="text-muted-foreground" style={{ width: size, height: size }} />;
}

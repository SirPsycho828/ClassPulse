import { LineChart, Line } from 'recharts';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ data, width = 80, height = 24, color = 'hsl(24, 55%, 60%)' }: SparklineProps) {
  if (data.length < 2) return null;

  const chartData = data.map((value, index) => ({ x: index, y: value }));

  return (
    <LineChart width={width} height={height} data={chartData}>
      <Line
        type="monotone"
        dataKey="y"
        stroke={color}
        dot={false}
        strokeWidth={1.5}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

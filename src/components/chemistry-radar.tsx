import type { ChemistryBreakdown } from '@/lib/types';

type ChemistryRadarProps = {
  breakdown: Pick<
    ChemistryBreakdown,
    'roleCoverage' | 'complementarity' | 'usageBalance' | 'twoWayBalance' | 'culture'
  >;
};

const AXES: Array<{
  key: keyof ChemistryRadarProps['breakdown'];
  label: string;
}> = [
  { key: 'roleCoverage', label: 'Role' },
  { key: 'complementarity', label: 'Fit' },
  { key: 'usageBalance', label: 'Usage' },
  { key: 'twoWayBalance', label: '2-Way' },
  { key: 'culture', label: 'Culture' }
];

const SIZE = 268;
const CENTER = SIZE / 2;
const RADIUS = 94;
const GRID_LEVELS = [0.2, 0.4, 0.6, 0.8, 1];

function polarToPoint(angle: number, radius: number) {
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius
  };
}

function toPointString(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

export function ChemistryRadar({ breakdown }: ChemistryRadarProps) {
  const axisAngles = AXES.map((_, index) => (-Math.PI / 2) + (index * 2 * Math.PI) / AXES.length);

  const labelPoints = axisAngles.map((angle) => polarToPoint(angle, RADIUS + 22));
  const axisPoints = axisAngles.map((angle) => polarToPoint(angle, RADIUS));
  const polygonPoints = AXES.map((axis, index) => {
    const value = Math.max(0, Math.min(100, breakdown[axis.key])) / 100;
    return polarToPoint(axisAngles[index] ?? 0, RADIUS * value);
  });

  return (
    <div className="w-full max-w-[22rem] rounded-xl border border-slate-200 bg-white p-3">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-auto w-full"
        role="img"
        aria-label="Chemistry radar chart"
      >
        <rect x="0" y="0" width={SIZE} height={SIZE} fill="transparent" />

        {GRID_LEVELS.map((level) => {
          const points = axisAngles.map((angle) => polarToPoint(angle, RADIUS * level));
          return (
            <polygon
              key={level}
              points={toPointString(points)}
              fill="none"
              stroke={level === 1 ? '#cbd5e1' : '#e2e8f0'}
              strokeWidth={level === 1 ? 1.2 : 1}
            />
          );
        })}

        {axisPoints.map((point, index) => (
          <line
            key={AXES[index]?.key}
            x1={CENTER}
            y1={CENTER}
            x2={point.x}
            y2={point.y}
            stroke="#cbd5e1"
            strokeWidth={1}
          />
        ))}

        <polygon
          points={toPointString(polygonPoints)}
          fill="rgba(37, 99, 235, 0.24)"
          stroke="#1d4ed8"
          strokeWidth={2}
        />

        {polygonPoints.map((point, index) => (
          <circle
            key={`${AXES[index]?.key}-dot`}
            cx={point.x}
            cy={point.y}
            r={3.8}
            fill="#1d4ed8"
            stroke="#dbeafe"
            strokeWidth={1.5}
          />
        ))}

        {labelPoints.map((point, index) => (
          <text
            key={`${AXES[index]?.key}-label`}
            x={point.x}
            y={point.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="700"
            fill="#334155"
          >
            {AXES[index]?.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

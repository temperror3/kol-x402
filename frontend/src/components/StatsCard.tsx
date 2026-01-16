interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  variant?: 'default' | 'gradient' | 'outline';
  color?: 'indigo' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';
}

const colorStyles = {
  indigo: {
    gradient: 'from-indigo-500 to-indigo-600',
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    shadow: 'shadow-indigo-500/20',
  },
  cyan: {
    gradient: 'from-cyan-500 to-cyan-600',
    bg: 'bg-cyan-50',
    text: 'text-cyan-600',
    iconBg: 'bg-cyan-100',
    shadow: 'shadow-cyan-500/20',
  },
  emerald: {
    gradient: 'from-emerald-500 to-emerald-600',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    shadow: 'shadow-emerald-500/20',
  },
  amber: {
    gradient: 'from-amber-500 to-amber-600',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    iconBg: 'bg-amber-100',
    shadow: 'shadow-amber-500/20',
  },
  rose: {
    gradient: 'from-rose-500 to-rose-600',
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    iconBg: 'bg-rose-100',
    shadow: 'shadow-rose-500/20',
  },
  slate: {
    gradient: 'from-slate-500 to-slate-600',
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    iconBg: 'bg-slate-100',
    shadow: 'shadow-slate-500/20',
  },
};

export default function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = 'default',
  color = 'indigo',
}: StatsCardProps) {
  const styles = colorStyles[color];

  if (variant === 'gradient') {
    return (
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${styles.gradient} p-6 text-white shadow-xl ${styles.shadow} card-hover`}>
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          {icon && (
            <div className="mb-4 inline-flex rounded-xl bg-white/20 p-3">
              {icon}
            </div>
          )}
          <p className="text-sm font-medium text-white/80">{title}</p>
          <p className="mt-2 text-4xl font-bold">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-white/70">{subtitle}</p>
          )}
          {trend && (
            <div className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${trend.isPositive ? 'bg-emerald-400/20 text-emerald-100' : 'bg-rose-400/20 text-rose-100'}`}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm border border-slate-100 card-hover">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`mt-2 text-3xl font-bold ${styles.text}`}>{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
          )}
          {trend && (
            <div className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${trend.isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        {icon && (
          <div className={`rounded-xl ${styles.iconBg} p-3 ${styles.text}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon: LucideIcon;
  delay?: number;
}

const StatsCard = ({ title, value, unit, icon: Icon, delay = 0 }: StatsCardProps) => {
  return (
    <motion.div
      className="stat-card group"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
          <Icon size={20} />
        </div>
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          {unit}
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold text-foreground font-mono tracking-tight">
          {value}
        </p>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>
    </motion.div>
  );
};

export default StatsCard;

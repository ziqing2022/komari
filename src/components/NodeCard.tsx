import React from 'react';
import { 
  Cpu, 
  HardDrive, 
  Activity, 
  ArrowDown, 
  ArrowUp, 
  Clock, 
  Globe, 
  Terminal, 
  ChevronRight,
  CircleAlert
} from 'lucide-react';
import { ServerNode } from '../types';
import { formatBytes, formatSpeed, formatUptime } from '../data/mockData';

interface NodeCardProps {
  node: ServerNode;
  onSelect: (node: ServerNode) => void;
  onOpenTerminal: (node: ServerNode) => void;
}

const countryFlags: Record<string, string> = {
  JP: '🇯🇵',
  DE: '🇩🇪',
  US: '🇺🇸',
  SG: '🇸🇬',
  GB: '🇬🇧',
  FR: '🇫🇷',
  HK: '🇭🇰',
  CN: '🇨🇳',
  CA: '🇨🇦',
  AU: '🇦🇺',
};

export const NodeCard: React.FC<NodeCardProps> = ({ node, onSelect, onOpenTerminal }) => {
  const { metrics } = node;

  // Status color logic
  const statusConfig = {
    online: {
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      dot: 'bg-emerald-400',
      text: 'Online',
    },
    warning: {
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-400',
      text: 'High Load',
    },
    offline: {
      badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      dot: 'bg-rose-400',
      text: 'Offline',
    },
  }[node.status];

  // Gauge bar coloring helper
  const getProgressColor = (percent: number) => {
    if (percent >= 90) return 'bg-rose-500';
    if (percent >= 75) return 'bg-amber-500';
    return 'bg-purple-500';
  };

  return (
    <div 
      id={`node-card-${node.uuid}`}
      className="group bg-neutral-900/80 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700/80 rounded-xl p-5 transition-all duration-200 shadow-sm hover:shadow-lg hover:shadow-purple-950/20 flex flex-col justify-between"
    >
      <div>
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl" title={node.city}>
              {countryFlags[node.countryCode] || '🌐'}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 
                  onClick={() => onSelect(node)}
                  className="font-semibold text-neutral-100 group-hover:text-purple-300 transition-colors cursor-pointer text-sm truncate max-w-[180px] sm:max-w-[220px]"
                >
                  {node.name}
                </h3>
              </div>
              <p className="text-xs text-neutral-400 font-mono flex items-center gap-1.5">
                <span>{node.publicIp}</span>
                <span className="text-neutral-600">•</span>
                <span className="text-neutral-400">{node.city}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusConfig.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} ${node.status === 'online' ? 'animate-pulse' : ''}`}></span>
              {statusConfig.text}
            </span>
          </div>
        </div>

        {/* System Meta Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-400 mb-4 pb-3 border-b border-neutral-800/80">
          <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-medium">
            {node.os}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
            {metrics.cpuCores} Cores
          </span>
          <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-neutral-500" />
            {formatUptime(metrics.uptimeSeconds)}
          </span>
          {node.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-800/30 text-[10px]">
              {tag}
            </span>
          ))}
        </div>

        {/* Real-Time Metrics Breakdown */}
        <div className="space-y-3">
          {/* CPU Metric */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-neutral-500" />
                CPU
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-500 font-mono">
                  load: {metrics.load1}
                </span>
                <span className="font-semibold text-neutral-200 font-mono text-xs">
                  {metrics.cpuPercent.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${getProgressColor(metrics.cpuPercent)}`}
                style={{ width: `${Math.min(100, Math.max(0, metrics.cpuPercent))}%` }}
              ></div>
            </div>
          </div>

          {/* Memory Metric */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-neutral-500" />
                Memory
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-500 font-mono">
                  {formatBytes(metrics.memUsed, 1)} / {formatBytes(metrics.memTotal, 0)}
                </span>
                <span className="font-semibold text-neutral-200 font-mono text-xs">
                  {metrics.memPercent.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${getProgressColor(metrics.memPercent)}`}
                style={{ width: `${Math.min(100, Math.max(0, metrics.memPercent))}%` }}
              ></div>
            </div>
          </div>

          {/* Disk Metric */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-neutral-500" />
                Disk
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-500 font-mono">
                  {formatBytes(metrics.diskUsed, 0)} / {formatBytes(metrics.diskTotal, 0)}
                </span>
                <span className="font-semibold text-neutral-200 font-mono text-xs">
                  {metrics.diskPercent.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${getProgressColor(metrics.diskPercent)}`}
                style={{ width: `${Math.min(100, Math.max(0, metrics.diskPercent))}%` }}
              ></div>
            </div>
          </div>

          {/* Network Real-Time Bandwidth */}
          <div className="pt-1 flex items-center justify-between text-xs bg-neutral-950/40 rounded-lg p-2 border border-neutral-800/60 font-mono">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ArrowDown className="w-3.5 h-3.5" />
              <span className="text-[11px] text-neutral-400">IN</span>
              <span className="font-semibold">{formatSpeed(metrics.netRxSpeed)}</span>
            </div>
            <div className="w-px h-3.5 bg-neutral-800"></div>
            <div className="flex items-center gap-1.5 text-indigo-400">
              <ArrowUp className="w-3.5 h-3.5" />
              <span className="text-[11px] text-neutral-400">OUT</span>
              <span className="font-semibold">{formatSpeed(metrics.netTxSpeed)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between">
        <button
          id={`btn-term-${node.uuid}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenTerminal(node);
          }}
          className="text-xs text-neutral-400 hover:text-purple-300 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-neutral-800"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Console</span>
        </button>

        <button
          id={`btn-details-${node.uuid}`}
          onClick={() => onSelect(node)}
          className="text-xs font-medium text-purple-400 hover:text-purple-300 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform"
        >
          <span>Telemetry</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

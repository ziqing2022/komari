import React, { useState } from 'react';
import { 
  X, 
  Cpu, 
  Activity, 
  HardDrive, 
  Network, 
  Terminal, 
  Clock, 
  Server, 
  Check, 
  Copy, 
  RotateCw,
  Zap,
  TrendingUp
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { ServerNode } from '../types';
import { formatBytes, formatSpeed, formatUptime } from '../data/mockData';

interface NodeDetailModalProps {
  node: ServerNode | null;
  onClose: () => void;
  onOpenTerminal: (node: ServerNode) => void;
  onTriggerSpike?: (uuid: string) => void;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({
  node,
  onClose,
  onOpenTerminal,
  onTriggerSpike,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<'cpu' | 'mem' | 'net'>('cpu');

  if (!node) return null;

  const { metrics } = node;

  const handleCopyUuid = () => {
    navigator.clipboard?.writeText(node.uuid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div 
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-purple-950/30"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-neutral-100">{node.name}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  {node.status.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono flex items-center gap-2">
                <span>{node.hostname}</span>
                <span className="text-neutral-600">|</span>
                <span>{node.publicIp}</span>
                <button
                  onClick={handleCopyUuid}
                  className="text-neutral-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1"
                  title="Copy Node UUID"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-modal-terminal"
              onClick={() => {
                onClose();
                onOpenTerminal(node);
              }}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>SSH Console</span>
            </button>
            <button
              id="btn-close-detail-modal"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Quick Stat Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/80">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-neutral-400" />
                CPU Cores & Load
              </span>
              <p className="text-base font-bold text-neutral-100 mt-1 font-mono">
                {metrics.cpuPercent.toFixed(1)}%
              </p>
              <p className="text-[11px] text-neutral-400 font-mono">
                load: {metrics.load1}, {metrics.load5}, {metrics.load15}
              </p>
            </div>

            <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/80">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-neutral-400" />
                Memory Used
              </span>
              <p className="text-base font-bold text-neutral-100 mt-1 font-mono">
                {formatBytes(metrics.memUsed, 1)}
              </p>
              <p className="text-[11px] text-neutral-400 font-mono">
                {metrics.memPercent.toFixed(1)}% of {formatBytes(metrics.memTotal, 0)}
              </p>
            </div>

            <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/80">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-neutral-400" />
                Disk Usage
              </span>
              <p className="text-base font-bold text-neutral-100 mt-1 font-mono">
                {formatBytes(metrics.diskUsed, 0)}
              </p>
              <p className="text-[11px] text-neutral-400 font-mono">
                {metrics.diskPercent.toFixed(1)}% of {formatBytes(metrics.diskTotal, 0)}
              </p>
            </div>

            <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/80">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                System Uptime
              </span>
              <p className="text-base font-bold text-neutral-100 mt-1 font-mono">
                {formatUptime(metrics.uptimeSeconds)}
              </p>
              <p className="text-[11px] text-neutral-400 font-mono">
                {metrics.processCount} procs • {metrics.tcpCount} TCP
              </p>
            </div>
          </div>

          {/* Historical Telemetry Charts */}
          <div className="bg-neutral-950/60 p-4 rounded-xl border border-neutral-800/80">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-semibold text-neutral-200">Real-Time Performance History</h4>
              </div>
              <div className="inline-flex rounded-lg p-1 bg-neutral-900 border border-neutral-800 text-xs">
                <button
                  onClick={() => setActiveChartTab('cpu')}
                  className={`px-3 py-1 rounded font-medium transition-colors ${
                    activeChartTab === 'cpu' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  CPU & Load
                </button>
                <button
                  onClick={() => setActiveChartTab('mem')}
                  className={`px-3 py-1 rounded font-medium transition-colors ${
                    activeChartTab === 'mem' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Memory
                </button>
                <button
                  onClick={() => setActiveChartTab('net')}
                  className={`px-3 py-1 rounded font-medium transition-colors ${
                    activeChartTab === 'net' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Network I/O
                </button>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {activeChartTab === 'cpu' ? (
                  <AreaChart data={node.recentHistory}>
                    <defs>
                      <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="time" stroke="#737373" fontSize={11} />
                    <YAxis stroke="#737373" domain={[0, 100]} unit="%" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="cpu" name="CPU Usage %" stroke="#a855f7" fillOpacity={1} fill="url(#cpuGrad)" strokeWidth={2} />
                  </AreaChart>
                ) : activeChartTab === 'mem' ? (
                  <AreaChart data={node.recentHistory}>
                    <defs>
                      <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="time" stroke="#737373" fontSize={11} />
                    <YAxis stroke="#737373" domain={[0, 100]} unit="%" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="mem" name="Memory Usage %" stroke="#3b82f6" fillOpacity={1} fill="url(#memGrad)" strokeWidth={2} />
                  </AreaChart>
                ) : (
                  <AreaChart data={node.recentHistory}>
                    <defs>
                      <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="time" stroke="#737373" fontSize={11} />
                    <YAxis stroke="#737373" unit=" KB/s" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Area type="monotone" dataKey="netRx" name="Download (RX)" stroke="#10b981" fillOpacity={1} fill="url(#rxGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="netTx" name="Upload (TX)" stroke="#6366f1" fillOpacity={1} fill="url(#txGrad)" strokeWidth={2} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Filesystem Disks & Network Interfaces */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Storage Mounts */}
            <div className="bg-neutral-950/60 p-4 rounded-xl border border-neutral-800/80">
              <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-neutral-400" />
                Mounted Disks & Volumes
              </h4>
              <div className="space-y-3">
                {metrics.disks.map((disk) => {
                  const pct = Math.round((disk.usedBytes / disk.totalBytes) * 100);
                  return (
                    <div key={disk.mountPoint} className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-mono text-neutral-200 font-medium">{disk.mountPoint}</span>
                        <span className="text-neutral-400 font-mono text-[11px]">
                          {formatBytes(disk.usedBytes, 0)} / {formatBytes(disk.totalBytes, 0)} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Network Interfaces */}
            <div className="bg-neutral-950/60 p-4 rounded-xl border border-neutral-800/80">
              <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-neutral-400" />
                Active Interfaces
              </h4>
              <div className="space-y-2.5">
                {metrics.networks.map((iface) => (
                  <div key={iface.name} className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-medium text-neutral-200">{iface.name}</span>
                      <p className="text-[10px] text-neutral-500 font-mono">
                        RX: {formatBytes(iface.rxBytes)} • TX: {formatBytes(iface.txBytes)}
                      </p>
                    </div>
                    <div className="text-right font-mono text-[11px]">
                      <span className="text-emerald-400 block">↓ {formatSpeed(iface.rxSpeed)}</span>
                      <span className="text-indigo-400 block">↑ {formatSpeed(iface.txSpeed)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System Specification Details */}
          <div className="bg-neutral-950/60 p-4 rounded-xl border border-neutral-800/80 text-xs">
            <h4 className="font-semibold text-neutral-300 uppercase tracking-wider mb-3">
              Hardware & OS Metadata
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4 text-neutral-400 font-mono text-[11px]">
              <div><span className="text-neutral-500">OS:</span> {node.osVersion}</div>
              <div><span className="text-neutral-500">Kernel:</span> {node.kernel}</div>
              <div><span className="text-neutral-500">Arch:</span> {node.arch}</div>
              <div className="sm:col-span-2 md:col-span-3">
                <span className="text-neutral-500">Processor:</span> {metrics.cpuModel}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-900 flex items-center justify-between">
          <button
            onClick={() => onTriggerSpike?.(node.uuid)}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1.5 transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Simulate Traffic Spike</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

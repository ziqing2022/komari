import React from 'react';
import { 
  Server, 
  Activity, 
  Plus, 
  Settings as SettingsIcon, 
  Terminal, 
  Network, 
  ShieldCheck, 
  Cpu, 
  HardDrive, 
  ArrowDownUp,
  Radio,
  Lock,
  Unlock
} from 'lucide-react';
import { ServerNode } from '../types';
import { formatBytes, formatSpeed } from '../data/mockData';

interface HeaderProps {
  nodes: ServerNode[];
  activeTab: 'nodes' | 'ping' | 'matrix';
  setActiveTab: (tab: 'nodes' | 'ping' | 'matrix') => void;
  onOpenAddNode: () => void;
  onOpenSettings: () => void;
  onOpenTerminal: (node?: ServerNode) => void;
  isAdmin: boolean;
  onToggleAdmin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  nodes,
  activeTab,
  setActiveTab,
  onOpenAddNode,
  onOpenSettings,
  onOpenTerminal,
  isAdmin,
  onToggleAdmin,
}) => {
  const onlineCount = nodes.filter((n) => n.status === 'online').length;
  const warningCount = nodes.filter((n) => n.status === 'warning').length;
  const offlineCount = nodes.filter((n) => n.status === 'offline').length;

  const totalCores = nodes.reduce((acc, n) => acc + n.metrics.cpuCores, 0);
  const totalMem = nodes.reduce((acc, n) => acc + n.metrics.memTotal, 0);
  const totalMemUsed = nodes.reduce((acc, n) => acc + n.metrics.memUsed, 0);
  const totalNetRxSpeed = nodes.reduce((acc, n) => acc + n.metrics.netRxSpeed, 0);
  const totalNetTxSpeed = nodes.reduce((acc, n) => acc + n.metrics.netTxSpeed, 0);

  return (
    <header className="border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-30 px-4 lg:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 text-white font-bold">
            <Server className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-neutral-100 tracking-tight flex items-center gap-2">
                Komari
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Monitor
                </span>
              </h1>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Live (1s)
              </span>
            </div>
            <p className="text-xs text-neutral-400 hidden sm:block">
              Lightweight, self-hosted server metrics & health telemetry
            </p>
          </div>
        </div>

        {/* Global Summary Stats */}
        <div className="hidden xl:flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 bg-neutral-800/60 px-3 py-1.5 rounded-lg border border-neutral-700/50">
            <Activity className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-400">Nodes:</span>
            <span className="text-emerald-400 font-semibold">{onlineCount} Online</span>
            {warningCount > 0 && <span className="text-amber-400 font-semibold">{warningCount} Warning</span>}
            {offlineCount > 0 && <span className="text-rose-400 font-semibold">{offlineCount} Offline</span>}
          </div>

          <div className="flex items-center gap-2 bg-neutral-800/60 px-3 py-1.5 rounded-lg border border-neutral-700/50">
            <Cpu className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-400">Total Cores:</span>
            <span className="text-neutral-200 font-medium">{totalCores}</span>
          </div>

          <div className="flex items-center gap-2 bg-neutral-800/60 px-3 py-1.5 rounded-lg border border-neutral-700/50">
            <HardDrive className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-400">RAM:</span>
            <span className="text-neutral-200 font-medium">
              {formatBytes(totalMemUsed, 0)} / {formatBytes(totalMem, 0)}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-neutral-800/60 px-3 py-1.5 rounded-lg border border-neutral-700/50">
            <ArrowDownUp className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-neutral-400">Total I/O:</span>
            <span className="text-purple-300 font-mono text-[11px]">
              ↓{formatSpeed(totalNetRxSpeed)} ↑{formatSpeed(totalNetTxSpeed)}
            </span>
          </div>
        </div>

        {/* Action Controls & Navigation */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          <div className="inline-flex rounded-lg p-1 bg-neutral-800/80 border border-neutral-700/60">
            <button
              id="nav-tab-nodes"
              onClick={() => setActiveTab('nodes')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'nodes'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Servers ({nodes.length})
            </button>
            <button
              id="nav-tab-ping"
              onClick={() => setActiveTab('ping')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'ping'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Radio className="w-3 h-3" />
              Ping Matrix
            </button>
          </div>

          <button
            id="btn-open-terminal"
            onClick={() => onOpenTerminal()}
            title="Web Terminal Simulator"
            className="p-2 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700/60 text-neutral-300 hover:text-white transition-colors"
          >
            <Terminal className="w-4 h-4" />
          </button>

          <button
            id="btn-open-settings"
            onClick={onOpenSettings}
            title="Komari Settings"
            className="p-2 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700/60 text-neutral-300 hover:text-white transition-colors"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>

          <button
            id="btn-admin-toggle"
            onClick={onToggleAdmin}
            title={isAdmin ? "Logged in as Admin" : "Log in as Admin"}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
              isAdmin
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-neutral-800/80 border-neutral-700/60 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {isAdmin ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isAdmin ? 'Admin' : 'Guest'}</span>
          </button>

          <button
            id="btn-add-node"
            onClick={onOpenAddNode}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-purple-600/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Server</span>
          </button>
        </div>
      </div>
    </header>
  );
};

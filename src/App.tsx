import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Filter, 
  LayoutGrid, 
  List, 
  Server, 
  Radio, 
  RefreshCw, 
  Activity, 
  ArrowDownUp, 
  Cpu, 
  Clock, 
  ChevronDown,
  Terminal,
  Zap,
  Globe
} from 'lucide-react';
import { ServerNode, PingTask, KomariSettings } from './types';
import { initialNodes, initialPingTasks, initialSettings, formatBytes, formatSpeed, formatUptime } from './data/mockData';
import { Header } from './components/Header';
import { NodeCard } from './components/NodeCard';
import { NodeDetailModal } from './components/NodeDetailModal';
import { PingMatrix } from './components/PingMatrix';
import { AddNodeModal } from './components/AddNodeModal';
import { SettingsModal } from './components/SettingsModal';
import { TerminalModal } from './components/TerminalModal';

export const App: React.FC = () => {
  const [nodes, setNodes] = useState<ServerNode[]>(initialNodes);
  const [pingTasks, setPingTasks] = useState<PingTask[]>(initialPingTasks);
  const [settings, setSettings] = useState<KomariSettings>(initialSettings);
  const [activeTab, setActiveTab] = useState<'nodes' | 'ping' | 'matrix'>('nodes');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'warning' | 'offline'>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  // Modals
  const [selectedNode, setSelectedNode] = useState<ServerNode | null>(null);
  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalNode, setTerminalNode] = useState<ServerNode | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Fetch initial data from local API if available
  useEffect(() => {
    fetch('/api/nodes')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setNodes(data);
        }
      })
      .catch(() => {
        // Fallback to initial seed nodes
      });

    fetch('/api/public')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.sitename) {
          setSettings((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});
  }, []);

  // Real-time dynamic telemetry heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (node.status === 'offline') return node;

          const cpuDelta = (Math.random() - 0.5) * 6;
          const newCpu = Math.max(2, Math.min(98, Number((node.metrics.cpuPercent + cpuDelta).toFixed(1))));

          const rxDelta = (Math.random() - 0.5) * (150 * 1024);
          const newRxSpeed = Math.max(50 * 1024, node.metrics.netRxSpeed + rxDelta);

          const txDelta = (Math.random() - 0.5) * (120 * 1024);
          const newTxSpeed = Math.max(30 * 1024, node.metrics.netTxSpeed + txDelta);

          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

          const newHistoryPoint = {
            time: timeStr,
            cpu: Math.round(newCpu),
            mem: Math.round(node.metrics.memPercent),
            netRx: Math.round(newRxSpeed / 1024),
            netTx: Math.round(newTxSpeed / 1024),
            load: node.metrics.load1,
          };

          const updatedHistory = [...node.recentHistory.slice(-19), newHistoryPoint];

          // Check for auto-warning status
          let newStatus = node.status;
          if (newCpu > 85 || node.metrics.memPercent > 90) {
            newStatus = 'warning';
          } else {
            newStatus = 'online';
          }

          return {
            ...node,
            status: newStatus,
            lastSeen: Date.now(),
            metrics: {
              ...node.metrics,
              cpuPercent: newCpu,
              netRxSpeed: newRxSpeed,
              netTxSpeed: newTxSpeed,
              netTotalRx: node.metrics.netTotalRx + newRxSpeed,
              netTotalTx: node.metrics.netTotalTx + newTxSpeed,
              uptimeSeconds: node.metrics.uptimeSeconds + Math.round(settings.refreshInterval / 1000),
            },
            recentHistory: updatedHistory,
          };
        })
      );
    }, settings.refreshInterval);

    return () => clearInterval(interval);
  }, [settings.refreshInterval]);

  // Keep selected node state in sync with real-time updates
  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find((n) => n.uuid === selectedNode.uuid);
      if (updated) setSelectedNode(updated);
    }
  }, [nodes]);

  // Unique tags list for filter dropdown
  const allTags = Array.from(new Set(nodes.flatMap((n) => n.tags)));

  // Filtered nodes
  const filteredNodes = nodes.filter((node) => {
    const matchesSearch =
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.publicIp.includes(searchQuery) ||
      node.city.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || node.status === statusFilter;
    const matchesTag = selectedTag === 'all' || node.tags.includes(selectedTag);

    return matchesSearch && matchesStatus && matchesTag;
  });

  const handleOpenTerminal = (node?: ServerNode) => {
    setTerminalNode(node || nodes[0]);
    setIsTerminalOpen(true);
  };

  const handleAddNode = (newNodeData: Partial<ServerNode>) => {
    const uuid = `node-${Date.now().toString(36)}`;
    const fullNode: ServerNode = {
      uuid,
      name: newNodeData.name || 'New Server',
      hostname: newNodeData.hostname || 'server.local',
      ip: '192.168.1.100',
      publicIp: newNodeData.publicIp || '203.0.113.195',
      region: 'Custom',
      countryCode: newNodeData.countryCode || 'US',
      city: newNodeData.city || 'Remote',
      os: newNodeData.os || 'Ubuntu',
      osVersion: `${newNodeData.os || 'Ubuntu'} 24.04`,
      kernel: '6.8.0-generic',
      arch: 'x86_64',
      status: 'online',
      lastSeen: Date.now(),
      tags: ['Custom'],
      metrics: newNodeData.metrics as any,
      recentHistory: [
        { time: '12:00:00', cpu: 15, mem: 35, netRx: 120, netTx: 80, load: 0.2 },
      ],
    };

    setNodes((prev) => [fullNode, ...prev]);

    // Send to backend API
    fetch('/api/clients/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullNode),
    }).catch(() => {});
  };

  const handleTriggerSpike = (uuid: string) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.uuid === uuid) {
          return {
            ...n,
            status: 'warning',
            metrics: {
              ...n.metrics,
              cpuPercent: 94.5,
              netRxSpeed: 18.5 * 1024 * 1024,
              netTxSpeed: 24.2 * 1024 * 1024,
            },
          };
        }
        return n;
      })
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* Header */}
      <Header
        nodes={nodes}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddNode={() => setIsAddNodeOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTerminal={handleOpenTerminal}
        isAdmin={isAdmin}
        onToggleAdmin={() => setIsAdmin(!isAdmin)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
        {activeTab === 'nodes' ? (
          <>
            {/* Filter & Toolbar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-neutral-900/60 p-3 rounded-xl border border-neutral-800/80">
              {/* Search Bar */}
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search servers, IPs, cities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end text-xs">
                {/* Status Filter */}
                <div className="flex items-center gap-1 bg-neutral-950 px-2 py-1 rounded-lg border border-neutral-800">
                  <span className="text-neutral-500 text-[11px]">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="bg-transparent text-neutral-200 focus:outline-none cursor-pointer"
                  >
                    <option value="all">All ({nodes.length})</option>
                    <option value="online">Online</option>
                    <option value="warning">High Load</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>

                {/* Tag Filter */}
                {allTags.length > 0 && (
                  <div className="flex items-center gap-1 bg-neutral-950 px-2 py-1 rounded-lg border border-neutral-800">
                    <span className="text-neutral-500 text-[11px]">Tag:</span>
                    <select
                      value={selectedTag}
                      onChange={(e) => setSelectedTag(e.target.value)}
                      className="bg-transparent text-neutral-200 focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Tags</option>
                      {allTags.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* View Mode Toggle */}
                <div className="inline-flex rounded-lg p-0.5 bg-neutral-950 border border-neutral-800">
                  <button
                    onClick={() => setViewMode('grid')}
                    title="Card Grid View"
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === 'grid' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    title="Compact Table View"
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === 'table' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Server Nodes Listing */}
            {filteredNodes.length === 0 ? (
              <div className="text-center py-16 bg-neutral-900/30 rounded-2xl border border-dashed border-neutral-800">
                <Server className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-neutral-300">No servers match your filter</h3>
                <p className="text-xs text-neutral-500 mt-1">Try clearing your search query or reset filter options.</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setSelectedTag('all');
                  }}
                  className="mt-4 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 font-medium"
                >
                  Reset Filters
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredNodes.map((node) => (
                  <NodeCard
                    key={node.uuid}
                    node={node}
                    onSelect={setSelectedNode}
                    onOpenTerminal={handleOpenTerminal}
                  />
                ))}
              </div>
            ) : (
              /* Table View */
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-950/80 text-neutral-400 border-b border-neutral-800 uppercase tracking-wider font-mono text-[11px]">
                      <tr>
                        <th className="px-5 py-3">Server</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Location</th>
                        <th className="px-5 py-3">CPU</th>
                        <th className="px-5 py-3">Memory</th>
                        <th className="px-5 py-3">Disk</th>
                        <th className="px-5 py-3">Bandwidth</th>
                        <th className="px-5 py-3">Uptime</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60 font-mono">
                      {filteredNodes.map((node) => (
                        <tr 
                          key={node.uuid}
                          className="hover:bg-neutral-800/40 transition-colors cursor-pointer"
                          onClick={() => setSelectedNode(node)}
                        >
                          <td className="px-5 py-3">
                            <div className="font-sans font-semibold text-neutral-200">{node.name}</div>
                            <div className="text-[11px] text-neutral-500">{node.publicIp} • {node.os}</div>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ${
                              node.status === 'online'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : node.status === 'warning'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                node.status === 'online' ? 'bg-emerald-400 animate-pulse' : node.status === 'warning' ? 'bg-amber-400' : 'bg-rose-400'
                              }`}></span>
                              {node.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-neutral-300 font-sans">
                            {node.city}, {node.countryCode}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-neutral-200">{node.metrics.cpuPercent.toFixed(1)}%</span>
                              <div className="w-12 h-1 bg-neutral-800 rounded-full overflow-hidden hidden sm:block">
                                <div className="h-full bg-purple-500 rounded-full" style={{ width: `${node.metrics.cpuPercent}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-neutral-200">{node.metrics.memPercent.toFixed(1)}%</span>
                              <span className="text-[10px] text-neutral-500">{formatBytes(node.metrics.memUsed, 0)}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-neutral-300">
                            {node.metrics.diskPercent.toFixed(0)}%
                          </td>
                          <td className="px-5 py-3">
                            <div className="text-[11px]">
                              <span className="text-emerald-400">↓{formatSpeed(node.metrics.netRxSpeed)}</span>{' '}
                              <span className="text-indigo-400">↑{formatSpeed(node.metrics.netTxSpeed)}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-neutral-400 font-sans">
                            {formatUptime(node.metrics.uptimeSeconds)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTerminal(node);
                              }}
                              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-purple-300 transition-colors"
                              title="Open Terminal"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Ping Matrix Tab */
          <PingMatrix
            tasks={pingTasks}
            nodes={nodes}
            onRefresh={() => {
              // Refresh ping jitter
              setPingTasks((prev) =>
                prev.map((t) => ({
                  ...t,
                  results: t.results.map((r) => ({
                    ...r,
                    latencyMs: Math.max(1, Number((r.latencyMs + (Math.random() - 0.5) * 1.5).toFixed(1))),
                  })),
                }))
              );
            }}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950/80 px-4 lg:px-8 py-4 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-400">{settings.sitename}</span>
            <span>•</span>
            <span>{settings.version}</span>
            <span>•</span>
            <span>Real-time Go/Node Server Daemon</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <a href="https://www.komari.wiki/" target="_blank" rel="noreferrer" className="hover:text-purple-400 transition-colors">
              Documentation
            </a>
            <a href="https://github.com/komari-monitor/komari" target="_blank" rel="noreferrer" className="hover:text-purple-400 transition-colors">
              GitHub Repository
            </a>
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              All Systems Operational
            </span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <NodeDetailModal
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onOpenTerminal={handleOpenTerminal}
        onTriggerSpike={handleTriggerSpike}
      />

      <AddNodeModal
        isOpen={isAddNodeOpen}
        onClose={() => setIsAddNodeOpen(false)}
        onAddNode={handleAddNode}
        discoveryKey={settings.autoDiscoveryKey}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={(newSettings) => setSettings(newSettings)}
      />

      <TerminalModal
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        nodes={nodes}
        initialNode={terminalNode}
      />
    </div>
  );
};

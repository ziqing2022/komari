import React, { useState } from 'react';
import { Radio, RefreshCw, Plus, CheckCircle2, AlertTriangle, XCircle, ArrowUpDown } from 'lucide-react';
import { PingTask, ServerNode } from '../types';

interface PingMatrixProps {
  tasks: PingTask[];
  nodes: ServerNode[];
  onRefresh: () => void;
}

export const PingMatrix: React.FC<PingMatrixProps> = ({ tasks, nodes, onRefresh }) => {
  const [selectedTask, setSelectedTask] = useState<string>(tasks[0]?.id || '');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const currentTask = tasks.find((t) => t.id === selectedTask) || tasks[0];

  const getLatencyBadge = (latency: number, loss: number) => {
    if (loss > 0) {
      return (
        <span className="inline-flex items-center gap-1 text-rose-400 font-mono text-xs">
          <AlertTriangle className="w-3 h-3" />
          {latency.toFixed(1)}ms ({loss}% loss)
        </span>
      );
    }
    if (latency < 20) {
      return <span className="text-emerald-400 font-mono font-medium text-xs">{latency.toFixed(1)}ms</span>;
    }
    if (latency < 80) {
      return <span className="text-emerald-300 font-mono text-xs">{latency.toFixed(1)}ms</span>;
    }
    if (latency < 150) {
      return <span className="text-amber-400 font-mono text-xs">{latency.toFixed(1)}ms</span>;
    }
    return <span className="text-rose-400 font-mono text-xs">{latency.toFixed(1)}ms</span>;
  };

  return (
    <div className="space-y-6">
      {/* Top Controller */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
        <div>
          <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
            <Radio className="w-4 h-4 text-purple-400" />
            Global Network Ping & Latency Matrix
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Distributed packet latency and jitter monitored across global edge nodes
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="btn-refresh-ping"
            onClick={handleManualRefresh}
            className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-purple-400' : ''}`} />
            <span>Probe Now</span>
          </button>
        </div>
      </div>

      {/* Target Selector Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tasks.map((task) => {
          const isSelected = task.id === currentTask?.id;
          const avgLatency = Math.round(
            task.results.reduce((acc, r) => acc + r.latencyMs, 0) / (task.results.length || 1)
          );
          return (
            <div
              key={task.id}
              onClick={() => setSelectedTask(task.id)}
              className={`cursor-pointer p-4 rounded-xl border transition-all ${
                isSelected
                  ? 'bg-purple-950/20 border-purple-500/50 shadow-md shadow-purple-950/30'
                  : 'bg-neutral-900/60 hover:bg-neutral-900 border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-neutral-200">{task.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase font-mono">
                  {task.type}
                </span>
              </div>
              <p className="text-xs font-mono text-neutral-400 mb-2">{task.target}</p>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-neutral-800/80">
                <span className="text-neutral-500">Avg Round-Trip:</span>
                <span className="font-mono font-bold text-purple-300">{avgLatency}ms</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Results Matrix Table */}
      {currentTask && (
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Latency Target: <span className="text-purple-300 font-mono normal-case">{currentTask.name} ({currentTask.target})</span>
            </h3>
            <span className="text-xs text-neutral-400">
              {currentTask.results.length} Active Probes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/60 text-neutral-400 border-b border-neutral-800 uppercase tracking-wider font-mono text-[11px]">
                <tr>
                  <th className="px-5 py-3">Reporting Node</th>
                  <th className="px-5 py-3">Region</th>
                  <th className="px-5 py-3">Latency</th>
                  <th className="px-5 py-3">Packet Loss</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono">
                {currentTask.results.map((res) => {
                  const node = nodes.find((n) => n.uuid === res.nodeUuid);
                  return (
                    <tr key={res.nodeUuid} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="px-5 py-3 text-neutral-200 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          <span>{res.nodeName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-neutral-400">
                        {node?.city || 'Global'}, {node?.countryCode || 'ANY'}
                      </td>
                      <td className="px-5 py-3">
                        {getLatencyBadge(res.latencyMs, res.packetLoss)}
                      </td>
                      <td className="px-5 py-3 text-neutral-400">
                        {res.packetLoss}%
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Passed
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

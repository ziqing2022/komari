import React, { useState } from 'react';
import { X, Copy, Check, Terminal, Server, Plus } from 'lucide-react';
import { ServerNode } from '../types';

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (newNode: Partial<ServerNode>) => void;
  discoveryKey: string;
}

export const AddNodeModal: React.FC<AddNodeModalProps> = ({
  isOpen,
  onClose,
  onAddNode,
  discoveryKey,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'install' | 'manual'>('install');

  // Manual form state
  const [name, setName] = useState('');
  const [city, setCity] = useState('New York');
  const [countryCode, setCountryCode] = useState('US');
  const [publicIp, setPublicIp] = useState('198.51.100.42');
  const [os, setOs] = useState<'Ubuntu' | 'Debian' | 'Alpine' | 'Arch Linux'>('Ubuntu');
  const [cpuCores, setCpuCores] = useState(4);
  const [memGb, setMemGb] = useState(8);

  if (!isOpen) return null;

  const installCommand = `curl -sSL https://raw.githubusercontent.com/komari-monitor/komari/main/install-komari.sh | bash -s -- --listen 0.0.0.0:3000 --key ${discoveryKey}`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onAddNode({
      name,
      hostname: `${name.toLowerCase().replace(/\s+/g, '-')}.infra`,
      city,
      countryCode,
      publicIp,
      os,
      metrics: {
        cpuPercent: 20 + Math.random() * 25,
        cpuCores,
        cpuModel: 'Intel Xeon Processor (v4)',
        load1: 0.35,
        load5: 0.28,
        load15: 0.25,
        memTotal: memGb * 1024 * 1024 * 1024,
        memUsed: (memGb * 0.38) * 1024 * 1024 * 1024,
        memPercent: 38,
        swapTotal: 2 * 1024 * 1024 * 1024,
        swapUsed: 0,
        diskTotal: 100 * 1024 * 1024 * 1024,
        diskUsed: 32 * 1024 * 1024 * 1024,
        diskPercent: 32,
        netRxSpeed: 450 * 1024,
        netTxSpeed: 380 * 1024,
        netTotalRx: 1.2e11,
        netTotalTx: 8.5e10,
        tcpCount: 88,
        processCount: 92,
        uptimeSeconds: 120000,
        disks: [
          { mountPoint: '/', totalBytes: 100 * 1024 * 1024 * 1024, usedBytes: 32 * 1024 * 1024 * 1024, fsType: 'ext4' },
        ],
        networks: [
          { name: 'eth0', rxBytes: 1.2e11, txBytes: 8.5e10, rxSpeed: 450 * 1024, txSpeed: 380 * 1024 },
        ],
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div 
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl shadow-purple-950/30"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Server className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-neutral-100">Add Server Node</h2>
          </div>
          <button
            id="btn-close-add-node"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-6 pt-4 border-b border-neutral-800 flex gap-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab('install')}
            className={`pb-2.5 border-b-2 transition-colors ${
              activeTab === 'install'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            One-Click Shell Script
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`pb-2.5 border-b-2 transition-colors ${
              activeTab === 'manual'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Manual Node Entry
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {activeTab === 'install' ? (
            <div className="space-y-4">
              <p className="text-xs text-neutral-300 leading-relaxed">
                Run this one-line command on your Linux server (Ubuntu, Debian, CentOS, Alpine, Arch) as root to download and start the Komari agent:
              </p>

              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 font-mono text-xs text-purple-300 relative group">
                <div className="flex items-start justify-between gap-2">
                  <span className="break-all select-all">{installCommand}</span>
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors shrink-0"
                    title="Copy command"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  <span>Agent automatically registers with Discovery Key</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  <span>Sends memory, CPU, disk, network, and ping telemetry at 1s intervals</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  <span>Systemd service auto-starts on system boot</span>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Node Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. US-East-Web-01"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1 font-medium">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1 font-medium">Country Code</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500 uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1 font-medium">Public IP</label>
                  <input
                    type="text"
                    value={publicIp}
                    onChange={(e) => setPublicIp(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1 font-medium">Operating System</label>
                  <select
                    value={os}
                    onChange={(e) => setOs(e.target.value as any)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500"
                  >
                    <option value="Ubuntu">Ubuntu Linux</option>
                    <option value="Debian">Debian GNU/Linux</option>
                    <option value="Alpine">Alpine Linux</option>
                    <option value="Arch Linux">Arch Linux</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1 font-medium">CPU Cores</label>
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={cpuCores}
                    onChange={(e) => setCpuCores(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1 font-medium">Memory (GB)</label>
                  <input
                    type="number"
                    min={1}
                    max={512}
                    value={memGb}
                    onChange={(e) => setMemGb(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register Simulated Node</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

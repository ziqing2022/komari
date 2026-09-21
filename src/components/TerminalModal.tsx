import React, { useState, useRef, useEffect } from 'react';
import { X, Terminal as TerminalIcon, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { ServerNode } from '../types';
import { formatBytes, formatUptime } from '../data/mockData';

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: ServerNode[];
  initialNode?: ServerNode | null;
}

interface CommandOutput {
  id: string;
  command: string;
  output: string | React.ReactNode;
  nodeName: string;
}

export const TerminalModal: React.FC<TerminalModalProps> = ({
  isOpen,
  onClose,
  nodes,
  initialNode,
}) => {
  const [selectedNodeUuid, setSelectedNodeUuid] = useState<string>(
    initialNode?.uuid || nodes[0]?.uuid || ''
  );
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<CommandOutput[]>([
    {
      id: 'init-1',
      command: '',
      output: 'Connected to Komari Remote Terminal Daemon (protocol v2). Type "help" for available commands.',
      nodeName: initialNode?.name || nodes[0]?.name || 'komari-node',
    },
  ]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeNode = nodes.find((n) => n.uuid === selectedNodeUuid) || nodes[0];

  useEffect(() => {
    if (initialNode) {
      setSelectedNodeUuid(initialNode.uuid);
    }
  }, [initialNode]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, history]);

  if (!isOpen) return null;

  const handleCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setCmdHistory((prev) => [...prev, trimmed]);
    setHistoryIdx(-1);

    if (trimmed.toLowerCase() === 'clear') {
      setHistory([]);
      setInputVal('');
      return;
    }

    let response: string | React.ReactNode = '';

    const lower = trimmed.toLowerCase();
    if (lower === 'help') {
      response = (
        <div className="space-y-1 text-neutral-300">
          <p className="text-purple-400 font-semibold">Available simulated commands:</p>
          <p><span className="text-emerald-400">uname -a</span> - Show system OS and kernel release</p>
          <p><span className="text-emerald-400">uptime</span> - Display system uptime and load average</p>
          <p><span className="text-emerald-400">top</span> - View CPU and memory resource consumption</p>
          <p><span className="text-emerald-400">free -m</span> - Display total, used and free RAM</p>
          <p><span className="text-emerald-400">df -h</span> - Show disk filesystem storage usage</p>
          <p><span className="text-emerald-400">ip a</span> - Inspect local network interfaces and IP addresses</p>
          <p><span className="text-emerald-400">ping &lt;target&gt;</span> - Probe ICMP round-trip latency</p>
          <p><span className="text-emerald-400">ps aux</span> - List active worker processes</p>
          <p><span className="text-emerald-400">clear</span> - Clear terminal screen</p>
        </div>
      );
    } else if (lower.startsWith('uname')) {
      response = `Linux ${activeNode.hostname} ${activeNode.kernel} #1 SMP PREEMPT_DYNAMIC ${activeNode.arch} GNU/Linux`;
    } else if (lower === 'uptime') {
      response = ` 14:32:01 up ${formatUptime(activeNode.metrics.uptimeSeconds)}, 2 users, load average: ${activeNode.metrics.load1}, ${activeNode.metrics.load5}, ${activeNode.metrics.load15}`;
    } else if (lower === 'free -m' || lower === 'free') {
      const totalMb = Math.round(activeNode.metrics.memTotal / (1024 * 1024));
      const usedMb = Math.round(activeNode.metrics.memUsed / (1024 * 1024));
      const freeMb = totalMb - usedMb;
      response = `               total        used        free      shared  buff/cache   available
Mem:           ${totalMb}        ${usedMb}        ${freeMb}          32        1240        ${freeMb + 600}
Swap:          4096         128        3968`;
    } else if (lower === 'df -h' || lower === 'df') {
      response = `Filesystem      Size  Used Avail Use% Mounted on
/dev/root       160G   52G  108G  33% /
tmpfs           4.0G     0  4.0G   0% /dev/shm
/dev/sda1       512M   64M  448M  13% /boot/efi
overlay         160G   52G  108G  33% /var/lib/docker`;
    } else if (lower === 'top') {
      response = `top - 14:32:05 up ${formatUptime(activeNode.metrics.uptimeSeconds)}, 2 users, load average: ${activeNode.metrics.load1}, ${activeNode.metrics.load5}, ${activeNode.metrics.load15}
Tasks: ${activeNode.metrics.processCount} total,   1 running, ${activeNode.metrics.processCount - 1} sleeping,   0 stopped,   0 zombie
%Cpu(s):  ${activeNode.metrics.cpuPercent.toFixed(1)} us,  2.1 sy,  0.0 ni, ${(97.9 - activeNode.metrics.cpuPercent).toFixed(1)} id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st
MiB Mem :  ${Math.round(activeNode.metrics.memTotal / (1024*1024))} total,   ${Math.round((activeNode.metrics.memTotal - activeNode.metrics.memUsed)/(1024*1024))} free,   ${Math.round(activeNode.metrics.memUsed / (1024*1024))} used
MiB Swap:   4096.0 total,   3968.0 free,    128.0 used.

    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
   1420 komari    20   0  712400  68420  32100 S  12.4   2.1   4:12.18 komari-agent
    892 systemd   20   0  182040  14200   9800 S   0.8   0.4   1:05.12 node_exporter
    610 root      20   0 1420500 184000  42100 S   4.2   5.8  18:42.09 containerd`;
    } else if (lower.startsWith('ping')) {
      const target = trimmed.split(' ')[1] || '1.1.1.1';
      response = `PING ${target} (${target}) 56(84) bytes of data.
64 bytes from ${target}: icmp_seq=1 ttl=58 time=4.21 ms
64 bytes from ${target}: icmp_seq=2 ttl=58 time=3.98 ms
64 bytes from ${target}: icmp_seq=3 ttl=58 time=4.05 ms
--- ${target} ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2003ms
rtt min/avg/max/mdev = 3.98/4.08/4.21/0.098 ms`;
    } else if (lower.startsWith('ip a') || lower === 'ifconfig') {
      response = `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    inet 127.0.0.1/8 scope host lo
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    inet ${activeNode.ip}/24 brd 192.168.10.255 scope global eth0
3: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN group default
    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0`;
    } else if (lower.startsWith('ps')) {
      response = `USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root           1  0.0  0.2 168420 12400 ?        Ss   Aug12   0:14 /sbin/init
root         412  0.0  0.1  28400  6200 ?        Ss   Aug12   0:02 /lib/systemd/systemd-journald
root         890  0.8  0.4 182040 14200 ?        Ssl  Aug12   1:05 /usr/bin/node_exporter
komari      1420  2.1  1.2 712400 68420 ?        Ssl  Aug12   4:12 /usr/local/bin/komari-agent --server 0.0.0.0:3000`;
    } else {
      response = `bash: ${trimmed}: command not found. Type "help" to list available commands.`;
    }

    setHistory((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        command: trimmed,
        output: response,
        nodeName: activeNode.name,
      },
    ]);
    setInputVal('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommand(inputVal);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const nextIdx = historyIdx + 1;
        if (nextIdx < cmdHistory.length) {
          setHistoryIdx(nextIdx);
          setInputVal(cmdHistory[cmdHistory.length - 1 - nextIdx]);
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInputVal(cmdHistory[cmdHistory.length - 1 - nextIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setInputVal('');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm">
      <div 
        className="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl shadow-purple-950/40 overflow-hidden font-mono text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Terminal Header */}
        <div className="px-4 py-3 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between font-sans">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80"></span>
              <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
            </div>
            <div className="flex items-center gap-2">
              <TerminalIcon className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-semibold text-neutral-200">
                Komari Web Terminal (SSH PTY)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-sans">
              <span className="text-neutral-500">Target:</span>
              <select
                value={selectedNodeUuid}
                onChange={(e) => setSelectedNodeUuid(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-purple-500"
              >
                {nodes.map((n) => (
                  <option key={n.uuid} value={n.uuid}>
                    {n.name} ({n.publicIp})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setHistory([])}
              title="Clear Output"
              className="p-1 rounded text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              id="btn-close-terminal"
              onClick={onClose}
              className="p-1 rounded text-neutral-500 hover:text-neutral-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal Content Screen */}
        <div 
          className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs bg-neutral-950 text-neutral-200"
          onClick={() => inputRef.current?.focus()}
        >
          {history.map((h) => (
            <div key={h.id} className="space-y-1">
              {h.command && (
                <div className="flex items-center gap-2 text-neutral-400">
                  <span className="text-emerald-400 font-semibold">root@{h.nodeName}:~#</span>
                  <span className="text-neutral-100">{h.command}</span>
                </div>
              )}
              <div className="text-neutral-300 whitespace-pre-wrap leading-relaxed pl-2 border-l-2 border-neutral-800">
                {h.output}
              </div>
            </div>
          ))}

          {/* Active Input Line */}
          <div className="flex items-center gap-2 text-neutral-200 pt-1">
            <span className="text-emerald-400 font-semibold shrink-0">
              root@{activeNode?.name || 'komari'}:~#
            </span>
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent focus:outline-none text-neutral-100 font-mono text-xs caret-purple-400"
              autoFocus
            />
          </div>
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};

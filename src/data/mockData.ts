import { ServerNode, PingTask, KomariSettings } from '../types';

export const initialSettings: KomariSettings = {
  sitename: 'Komari Monitor',
  description: 'Lightweight & Efficient Server Monitoring Solution',
  version: 'v1.4.2',
  theme: 'default',
  privateSite: false,
  allowGuest: true,
  refreshInterval: 2000,
  autoDiscoveryKey: 'km_auto_8f93e18a992bc',
  notificationEnabled: true,
};

const generateInitialHistory = (baseCpu: number, baseMem: number) => {
  const points = [];
  const now = Date.now();
  for (let i = 19; i >= 0; i--) {
    const t = new Date(now - i * 15000);
    const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`;
    const jitter = (Math.random() - 0.5) * 8;
    points.push({
      time: timeStr,
      cpu: Math.max(1, Math.min(99, Math.round(baseCpu + jitter))),
      mem: Math.max(5, Math.min(98, Math.round(baseMem + (Math.random() - 0.5) * 3))),
      netRx: Math.round(150 + Math.random() * 800),
      netTx: Math.round(100 + Math.random() * 500),
      load: Number((0.2 + (baseCpu / 100) * 1.5).toFixed(2)),
    });
  }
  return points;
};

export const initialNodes: ServerNode[] = [
  {
    uuid: 'node-tokyo-01',
    name: 'JP-Tokyo-Edge-01',
    hostname: 'tyo-edge01.infra.komari',
    ip: '192.168.10.12',
    publicIp: '133.242.180.45',
    region: 'Asia East',
    countryCode: 'JP',
    city: 'Tokyo',
    os: 'Ubuntu',
    osVersion: 'Ubuntu 24.04 LTS',
    kernel: '6.8.0-45-generic',
    arch: 'x86_64',
    status: 'online',
    lastSeen: Date.now(),
    tags: ['Edge', 'BGP', 'Gateway'],
    metrics: {
      cpuPercent: 18.5,
      cpuCores: 4,
      cpuModel: 'AMD EPYC 7763 64-Core Processor',
      load1: 0.42,
      load5: 0.38,
      load15: 0.35,
      memTotal: 8 * 1024 * 1024 * 1024,
      memUsed: 3.2 * 1024 * 1024 * 1024,
      memPercent: 40.0,
      swapTotal: 4 * 1024 * 1024 * 1024,
      swapUsed: 0.1 * 1024 * 1024 * 1024,
      diskTotal: 160 * 1024 * 1024 * 1024,
      diskUsed: 52 * 1024 * 1024 * 1024,
      diskPercent: 32.5,
      netRxSpeed: 1250 * 1024, // 1.25 MB/s
      netTxSpeed: 890 * 1024,
      netTotalRx: 1.4 * 1024 * 1024 * 1024 * 1024,
      netTotalTx: 920 * 1024 * 1024 * 1024,
      tcpCount: 142,
      processCount: 108,
      uptimeSeconds: 842100, // ~9.7 days
      disks: [
        { mountPoint: '/', totalBytes: 160 * 1024 * 1024 * 1024, usedBytes: 52 * 1024 * 1024 * 1024, fsType: 'ext4' },
      ],
      networks: [
        { name: 'eth0', rxBytes: 1.4e12, txBytes: 9.2e11, rxSpeed: 1250 * 1024, txSpeed: 890 * 1024 },
        { name: 'docker0', rxBytes: 2.1e10, txBytes: 2.3e10, rxSpeed: 45 * 1024, txSpeed: 42 * 1024 },
      ],
    },
    recentHistory: generateInitialHistory(18, 40),
  },
  {
    uuid: 'node-frankfurt-02',
    name: 'DE-Frankfurt-App-01',
    hostname: 'fra-app01.prod.komari',
    ip: '10.200.4.18',
    publicIp: '185.190.140.22',
    region: 'Europe West',
    countryCode: 'DE',
    city: 'Frankfurt',
    os: 'Debian',
    osVersion: 'Debian GNU/Linux 12 (bookworm)',
    kernel: '6.1.0-23-amd64',
    arch: 'x86_64',
    status: 'online',
    lastSeen: Date.now(),
    tags: ['Kubernetes', 'Worker', 'API'],
    metrics: {
      cpuPercent: 54.2,
      cpuCores: 8,
      cpuModel: 'Intel Xeon Platinum 8375C @ 2.80GHz',
      load1: 2.15,
      load5: 1.88,
      load15: 1.62,
      memTotal: 16 * 1024 * 1024 * 1024,
      memUsed: 11.4 * 1024 * 1024 * 1024,
      memPercent: 71.25,
      swapTotal: 8 * 1024 * 1024 * 1024,
      swapUsed: 0.8 * 1024 * 1024 * 1024,
      diskTotal: 320 * 1024 * 1024 * 1024,
      diskUsed: 210 * 1024 * 1024 * 1024,
      diskPercent: 65.6,
      netRxSpeed: 4800 * 1024, // 4.8 MB/s
      netTxSpeed: 6200 * 1024, // 6.2 MB/s
      netTotalRx: 4.8 * 1024 * 1024 * 1024 * 1024,
      netTotalTx: 7.1 * 1024 * 1024 * 1024 * 1024,
      tcpCount: 480,
      processCount: 224,
      uptimeSeconds: 2450300, // ~28 days
      disks: [
        { mountPoint: '/', totalBytes: 80 * 1024 * 1024 * 1024, usedBytes: 42 * 1024 * 1024 * 1024, fsType: 'ext4' },
        { mountPoint: '/var/lib/docker', totalBytes: 240 * 1024 * 1024 * 1024, usedBytes: 168 * 1024 * 1024 * 1024, fsType: 'overlay2' },
      ],
      networks: [
        { name: 'ens3', rxBytes: 4.8e12, txBytes: 7.1e12, rxSpeed: 4800 * 1024, txSpeed: 6200 * 1024 },
      ],
    },
    recentHistory: generateInitialHistory(54, 71),
  },
  {
    uuid: 'node-uswest-03',
    name: 'US-SiliconValley-DB',
    hostname: 'sjc-db01.cluster.komari',
    ip: '172.16.50.9',
    publicIp: '144.202.88.104',
    region: 'North America',
    countryCode: 'US',
    city: 'San Jose',
    os: 'Ubuntu',
    osVersion: 'Ubuntu 22.04.4 LTS',
    kernel: '5.15.0-117-generic',
    arch: 'x86_64',
    status: 'online',
    lastSeen: Date.now(),
    tags: ['Database', 'PostgreSQL', 'Storage'],
    metrics: {
      cpuPercent: 28.0,
      cpuCores: 8,
      cpuModel: 'AMD EPYC 7B13 64-Core Processor',
      load1: 0.95,
      load5: 0.82,
      load15: 0.77,
      memTotal: 32 * 1024 * 1024 * 1024,
      memUsed: 19.8 * 1024 * 1024 * 1024,
      memPercent: 61.8,
      swapTotal: 16 * 1024 * 1024 * 1024,
      swapUsed: 0,
      diskTotal: 800 * 1024 * 1024 * 1024,
      diskUsed: 380 * 1024 * 1024 * 1024,
      diskPercent: 47.5,
      netRxSpeed: 820 * 1024,
      netTxSpeed: 1400 * 1024,
      netTotalRx: 2.9 * 1024 * 1024 * 1024 * 1024,
      netTotalTx: 5.6 * 1024 * 1024 * 1024 * 1024,
      tcpCount: 310,
      processCount: 162,
      uptimeSeconds: 5120000, // ~59 days
      disks: [
        { mountPoint: '/', totalBytes: 100 * 1024 * 1024 * 1024, usedBytes: 28 * 1024 * 1024 * 1024, fsType: 'ext4' },
        { mountPoint: '/data/pgdata', totalBytes: 700 * 1024 * 1024 * 1024, usedBytes: 352 * 1024 * 1024 * 1024, fsType: 'xfs' },
      ],
      networks: [
        { name: 'eth0', rxBytes: 2.9e12, txBytes: 5.6e12, rxSpeed: 820 * 1024, txSpeed: 1400 * 1024 },
      ],
    },
    recentHistory: generateInitialHistory(28, 62),
  },
  {
    uuid: 'node-singapore-04',
    name: 'SG-Jurong-Cache-01',
    hostname: 'sin-redis01.komari',
    ip: '10.10.88.3',
    publicIp: '103.253.142.66',
    region: 'Asia Southeast',
    countryCode: 'SG',
    city: 'Singapore',
    os: 'Alpine',
    osVersion: 'Alpine Linux v3.20',
    kernel: '6.6.47-0-virt',
    arch: 'x86_64',
    status: 'online',
    lastSeen: Date.now(),
    tags: ['Cache', 'Redis', 'MicroVM'],
    metrics: {
      cpuPercent: 12.4,
      cpuCores: 2,
      cpuModel: 'Intel Xeon Processor (Skylake)',
      load1: 0.18,
      load5: 0.15,
      load15: 0.12,
      memTotal: 4 * 1024 * 1024 * 1024,
      memUsed: 2.1 * 1024 * 1024 * 1024,
      memPercent: 52.5,
      swapTotal: 0,
      swapUsed: 0,
      diskTotal: 40 * 1024 * 1024 * 1024,
      diskUsed: 6.4 * 1024 * 1024 * 1024,
      diskPercent: 16.0,
      netRxSpeed: 640 * 1024,
      netTxSpeed: 710 * 1024,
      netTotalRx: 680 * 1024 * 1024 * 1024,
      netTotalTx: 820 * 1024 * 1024 * 1024,
      tcpCount: 95,
      processCount: 42,
      uptimeSeconds: 1820400, // ~21 days
      disks: [
        { mountPoint: '/', totalBytes: 40 * 1024 * 1024 * 1024, usedBytes: 6.4 * 1024 * 1024 * 1024, fsType: 'ext4' },
      ],
      networks: [
        { name: 'eth0', rxBytes: 6.8e11, txBytes: 8.2e11, rxSpeed: 640 * 1024, txSpeed: 710 * 1024 },
      ],
    },
    recentHistory: generateInitialHistory(12, 52),
  },
  {
    uuid: 'node-london-05',
    name: 'UK-London-Staging',
    hostname: 'lon-stg01.dev.komari',
    ip: '192.168.40.5',
    publicIp: '51.89.155.80',
    region: 'Europe West',
    countryCode: 'GB',
    city: 'London',
    os: 'Arch Linux',
    osVersion: 'Arch Linux rolling',
    kernel: '6.10.6-arch1-1',
    arch: 'x86_64',
    status: 'warning',
    lastSeen: Date.now() - 35000,
    tags: ['Staging', 'CI/CD', 'Build'],
    metrics: {
      cpuPercent: 88.6,
      cpuCores: 4,
      cpuModel: 'AMD Ryzen 9 5950X 16-Core Processor',
      load1: 4.80,
      load5: 3.92,
      load15: 2.85,
      memTotal: 16 * 1024 * 1024 * 1024,
      memUsed: 14.8 * 1024 * 1024 * 1024,
      memPercent: 92.5,
      swapTotal: 8 * 1024 * 1024 * 1024,
      swapUsed: 4.2 * 1024 * 1024 * 1024,
      diskTotal: 250 * 1024 * 1024 * 1024,
      diskUsed: 220 * 1024 * 1024 * 1024,
      diskPercent: 88.0,
      netRxSpeed: 8900 * 1024,
      netTxSpeed: 4200 * 1024,
      netTotalRx: 3.4 * 1024 * 1024 * 1024 * 1024,
      netTotalTx: 1.8 * 1024 * 1024 * 1024 * 1024,
      tcpCount: 620,
      processCount: 310,
      uptimeSeconds: 412000,
      disks: [
        { mountPoint: '/', totalBytes: 250 * 1024 * 1024 * 1024, usedBytes: 220 * 1024 * 1024 * 1024, fsType: 'btrfs' },
      ],
      networks: [
        { name: 'enp3s0', rxBytes: 3.4e12, txBytes: 1.8e12, rxSpeed: 8900 * 1024, txSpeed: 4200 * 1024 },
      ],
    },
    recentHistory: generateInitialHistory(88, 92),
  },
];

export const initialPingTasks: PingTask[] = [
  {
    id: 'ping-cloudflare',
    name: 'Cloudflare Anycast DNS',
    target: '1.1.1.1',
    type: 'icmp',
    interval: 5,
    results: [
      { nodeUuid: 'node-tokyo-01', nodeName: 'JP-Tokyo-Edge-01', latencyMs: 2.1, packetLoss: 0, status: 'good' },
      { nodeUuid: 'node-frankfurt-02', nodeName: 'DE-Frankfurt-App-01', latencyMs: 3.4, packetLoss: 0, status: 'good' },
      { nodeUuid: 'node-uswest-03', nodeName: 'US-SiliconValley-DB', latencyMs: 4.8, packetLoss: 0, status: 'good' },
      { nodeUuid: 'node-singapore-04', nodeName: 'SG-Jurong-Cache-01', latencyMs: 1.9, packetLoss: 0, status: 'good' },
      { nodeUuid: 'node-london-05', nodeName: 'UK-London-Staging', latencyMs: 5.2, packetLoss: 0, status: 'good' },
    ],
  },
  {
    id: 'ping-google',
    name: 'Google Public DNS',
    target: '8.8.8.8',
    type: 'icmp',
    interval: 5,
    results: [
      { nodeUuid: 'node-tokyo-01', nodeName: 'JP-Tokyo-Edge-01', latencyMs: 3.8, packetLoss: 0, status: 'good' },
      { nodeUuid: 'node-frankfurt-02', nodeName: 'DE-Frankfurt-App-01', latencyMs: 4.1, packetLoss: 0, status: 'good' },
      { nodeUuid: 'node-uswest-03', nodeName: 'US-SiliconValley-DB', latencyMs: 3.2, packetLoss: 0, status: 'good' },
      { nodeUuid: 'node-singapore-04', nodeName: 'SG-Jurong-Cache-01', latencyMs: 4.5, packetLoss: 0, status: 'good' },
      { nodeUuid: 'node-london-05', nodeName: 'UK-London-Staging', latencyMs: 6.8, packetLoss: 0, status: 'good' },
    ],
  },
  {
    id: 'ping-github',
    name: 'GitHub API (api.github.com)',
    target: '140.82.112.6',
    type: 'tcp',
    interval: 10,
    results: [
      { nodeUuid: 'node-tokyo-01', nodeName: 'JP-Tokyo-Edge-01', latencyMs: 104.5, packetLoss: 0, status: 'medium' },
      { nodeUuid: 'node-frankfurt-02', nodeName: 'DE-Frankfurt-App-01', latencyMs: 82.3, packetLoss: 0, status: 'medium' },
      { nodeUuid: 'node-uswest-03', nodeName: 'US-SiliconValley-DB', latencyMs: 12.4, packetLoss: 0, status: 'good' },
      { nodeUuid: 'node-singapore-04', nodeName: 'SG-Jurong-Cache-01', latencyMs: 168.0, packetLoss: 0.5, status: 'medium' },
      { nodeUuid: 'node-london-05', nodeName: 'UK-London-Staging', latencyMs: 76.1, packetLoss: 0, status: 'good' },
    ],
  },
];

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

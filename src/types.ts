export interface ServerDisk {
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  fsType: string;
}

export interface ServerNetworkInterface {
  name: string;
  rxBytes: number;
  txBytes: number;
  rxSpeed: number; // bytes/sec
  txSpeed: number; // bytes/sec
}

export interface ServerMetrics {
  cpuPercent: number;
  cpuCores: number;
  cpuModel: string;
  load1: number;
  load5: number;
  load15: number;
  memTotal: number; // bytes
  memUsed: number;  // bytes
  memPercent: number;
  swapTotal: number;
  swapUsed: number;
  diskTotal: number;
  diskUsed: number;
  diskPercent: number;
  netRxSpeed: number; // bytes/sec
  netTxSpeed: number; // bytes/sec
  netTotalRx: number; // bytes
  netTotalTx: number; // bytes
  tcpCount: number;
  processCount: number;
  uptimeSeconds: number;
  disks: ServerDisk[];
  networks: ServerNetworkInterface[];
}

export interface ServerNode {
  uuid: string;
  name: string;
  hostname: string;
  ip: string;
  publicIp: string;
  region: string;
  countryCode: string; // e.g. "US", "JP", "DE", "SG"
  city: string;
  os: 'Ubuntu' | 'Debian' | 'Alpine' | 'CentOS' | 'Arch Linux' | 'Windows' | 'macOS' | 'Other';
  osVersion: string;
  kernel: string;
  arch: string;
  status: 'online' | 'warning' | 'offline';
  lastSeen: number; // unix ms
  tags: string[];
  metrics: ServerMetrics;
  recentHistory: {
    time: string;
    cpu: number;
    mem: number;
    netRx: number; // KB/s
    netTx: number; // KB/s
    load: number;
  }[];
}

export interface PingTask {
  id: string;
  name: string;
  target: string;
  type: 'icmp' | 'tcp' | 'http';
  interval: number; // seconds
  results: {
    nodeUuid: string;
    nodeName: string;
    latencyMs: number;
    packetLoss: number;
    status: 'good' | 'medium' | 'bad' | 'down';
  }[];
}

export interface KomariSettings {
  sitename: string;
  description: string;
  version: string;
  theme: string;
  privateSite: boolean;
  allowGuest: boolean;
  refreshInterval: number; // ms
  autoDiscoveryKey: string;
  notificationEnabled: boolean;
}

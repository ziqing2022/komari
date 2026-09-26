import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { exec } from 'child_process';
import QRCode from 'qrcode';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
const PORT = 3000;

app.use(express.json());

// User Account & 2FA Setup
interface UserAccount {
  uuid: string;
  username: string;
  role: string;
  logged_in: boolean;
  created_at: string;
  "2fa_enabled": boolean;
  two_factor?: string;
  sso_type?: string;
  sso_id?: string;
}

const USER_ACCOUNT_FILE = path.join(process.cwd(), 'komari-web', 'user-account.json');

function loadUserAccount(): UserAccount {
  const defaultAccount: UserAccount = {
    uuid: 'admin-user-01',
    username: 'admin',
    role: 'admin',
    logged_in: true,
    created_at: '2024-01-01T00:00:00Z',
    "2fa_enabled": false,
    two_factor: '',
    sso_type: '',
    sso_id: ''
  };

  try {
    if (fs.existsSync(USER_ACCOUNT_FILE)) {
      const data = JSON.parse(fs.readFileSync(USER_ACCOUNT_FILE, 'utf-8'));
      return { ...defaultAccount, ...data };
    }
  } catch (e) {
    console.error('Error reading user-account.json:', e);
  }
  saveUserAccount(defaultAccount);
  return defaultAccount;
}

function saveUserAccount(account: UserAccount) {
  try {
    fs.writeFileSync(USER_ACCOUNT_FILE, JSON.stringify(account, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing user-account.json:', e);
  }
}

// RFC 3548 / RFC 4648 Base32 Decoder
function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// RFC 6238 TOTP Generator (30-second window, 6 digits)
function generateTOTP(secret: string, timeStepOffset = 0): string {
  const secretBuffer = base32Decode(secret);
  const timeStep = 30;
  const counter = Math.floor(Date.now() / 1000 / timeStep) + timeStepOffset;
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % 1000000).toString().padStart(6, '0');
}

// Verify TOTP within ±5 steps (to accommodate network latency & clock drift)
function verifyTOTP(token: string, secret: string): boolean {
  if (!token || !secret) return false;
  const cleanedToken = token.replace(/[\s-]/g, '').trim();
  if (cleanedToken.length !== 6 || !/^\d{6}$/.test(cleanedToken)) return false;

  for (const offset of [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]) {
    if (generateTOTP(secret, offset) === cleanedToken) {
      return true;
    }
  }
  return false;
}

// Extract 2FA code from headers, body, or query
function get2FACodeFromReq(req: express.Request): string {
  const headers = req.headers;
  if (headers['x-2fa-code']) return String(headers['x-2fa-code']).trim();
  if (headers['x-two-factor-code']) return String(headers['x-two-factor-code']).trim();

  if (req.query) {
    if (req.query['2fa_code']) return String(req.query['2fa_code']).trim();
    if (req.query['code']) return String(req.query['code']).trim();
    if (req.query['otp']) return String(req.query['otp']).trim();
  }

  if (req.body && typeof req.body === 'object') {
    if (req.body['2fa_code']) return String(req.body['2fa_code']).trim();
    if (req.body['two_factor_code']) return String(req.body['two_factor_code']).trim();
    if (req.body['code']) return String(req.body['code']).trim();
    if (req.body['otp']) return String(req.body['otp']).trim();
  }

  return '';
}

// Middleware: RequireSensitive2FA (equivalent to Go RequireSensitive2FA in web/api/AuthSensitive.go)
function requireSensitive2FA(req: express.Request, res: express.Response, next: express.NextFunction) {
  const account = loadUserAccount();
  if (!account['2fa_enabled'] || !account.two_factor) {
    // 2FA is not enabled on user account, allow operation directly
    return next();
  }

  const code = get2FACodeFromReq(req);
  if (!code) {
    return res.status(401).json({
      status: 'error',
      message: '2FA code is required'
    });
  }

  const isValid = verifyTOTP(code, account.two_factor);
  if (!isValid) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid 2FA code'
    });
  }

  next();
}

// Load komari-theme.json
const themeFilePath = path.join(process.cwd(), 'komari-web', 'komari-theme.json');
let komariThemeData: any = {};
try {
  if (fs.existsSync(themeFilePath)) {
    komariThemeData = JSON.parse(fs.readFileSync(themeFilePath, 'utf-8'));
  }
} catch (e) {
  console.error('Error reading theme file:', e);
}

// Initial Server Nodes Specification
const initialNodes: Record<string, any> = {
  'node-us-west': {
    uuid: 'node-us-west',
    name: 'US-West-SiliconValley',
    cpu_name: 'AMD EPYC 9654 96-Core Processor',
    virtualization: 'KVM',
    arch: 'x86_64',
    cpu_cores: 8,
    os: 'Ubuntu 24.04.1 LTS',
    kernel_version: '6.8.0-45-generic',
    gpu_name: '',
    region: 'US',
    mem_total: 16 * 1024 * 1024 * 1024,
    swap_total: 4 * 1024 * 1024 * 1024,
    disk_total: 250 * 1024 * 1024 * 1024,
    version: '1.2.5',
    weight: 100,
    price: 15,
    currency: 'USD',
    tags: 'BGP,Production,Core',
    group: 'North America',
    billing_cycle: 30,
    traffic_limit: 10 * 1024 * 1024 * 1024 * 1024,
    traffic_limit_type: 'sum',
    expired_at: '2027-12-31T23:59:59Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
    ipv4: '198.51.100.24',
    ipv6: '2001:db8::1'
  },
  'node-jp-tokyo': {
    uuid: 'node-jp-tokyo',
    name: 'JP-Tokyo-Equinix',
    cpu_name: 'Intel Xeon Platinum 8480+',
    virtualization: 'KVM',
    arch: 'x86_64',
    cpu_cores: 4,
    os: 'Debian GNU/Linux 12 (bookworm)',
    kernel_version: '6.1.0-21-amd64',
    gpu_name: '',
    region: 'JP',
    mem_total: 8 * 1024 * 1024 * 1024,
    swap_total: 2 * 1024 * 1024 * 1024,
    disk_total: 120 * 1024 * 1024 * 1024,
    version: '1.2.5',
    weight: 90,
    price: 12,
    currency: 'USD',
    tags: 'CN2-GIA,Asia,Edge',
    group: 'Asia Pacific',
    billing_cycle: 30,
    traffic_limit: 5 * 1024 * 1024 * 1024 * 1024,
    traffic_limit_type: 'sum',
    expired_at: '2027-12-31T23:59:59Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
    ipv4: '203.0.113.88',
    ipv6: '2001:db8:jp::1'
  },
  'node-de-fra': {
    uuid: 'node-de-fra',
    name: 'EU-Frankfurt-Hetzner',
    cpu_name: 'AMD Ryzen 9 7950X 16-Core',
    virtualization: 'Dedicated',
    arch: 'x86_64',
    cpu_cores: 16,
    os: 'Arch Linux',
    kernel_version: '6.10.3-arch1-1',
    gpu_name: '',
    region: 'DE',
    mem_total: 64 * 1024 * 1024 * 1024,
    swap_total: 8 * 1024 * 1024 * 1024,
    disk_total: 1024 * 1024 * 1024 * 1024,
    version: '1.2.5',
    weight: 85,
    price: 45,
    currency: 'EUR',
    tags: 'High-Compute,Database,EU',
    group: 'Europe',
    billing_cycle: 30,
    traffic_limit: 20 * 1024 * 1024 * 1024 * 1024,
    traffic_limit_type: 'sum',
    expired_at: '2027-12-31T23:59:59Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
    ipv4: '198.51.100.199',
    ipv6: '2001:db8:de::1'
  },
  'node-sg-sin': {
    uuid: 'node-sg-sin',
    name: 'SG-Singapore-DigitalOcean',
    cpu_name: 'Intel Xeon Gold 6338',
    virtualization: 'KVM',
    arch: 'x86_64',
    cpu_cores: 2,
    os: 'Ubuntu 22.04.4 LTS',
    kernel_version: '5.15.0-107-generic',
    gpu_name: '',
    region: 'SG',
    mem_total: 4 * 1024 * 1024 * 1024,
    swap_total: 1 * 1024 * 1024 * 1024,
    disk_total: 80 * 1024 * 1024 * 1024,
    version: '1.2.5',
    weight: 70,
    price: 6,
    currency: 'USD',
    tags: 'Proxy,Lightweight',
    group: 'Asia Pacific',
    billing_cycle: 30,
    traffic_limit: 2 * 1024 * 1024 * 1024 * 1024,
    traffic_limit_type: 'sum',
    expired_at: '2027-12-31T23:59:59Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
    ipv4: '203.0.113.45',
    ipv6: '2001:db8:sg::1'
  },
  'node-hk-edge': {
    uuid: 'node-hk-edge',
    name: 'HK-HongKong-CN2',
    cpu_name: 'AMD EPYC 7B13 64-Core',
    virtualization: 'KVM',
    arch: 'x86_64',
    cpu_cores: 4,
    os: 'Alpine Linux v3.20',
    kernel_version: '6.6.38-0-virt',
    gpu_name: '',
    region: 'HK',
    mem_total: 8 * 1024 * 1024 * 1024,
    swap_total: 2 * 1024 * 1024 * 1024,
    disk_total: 100 * 1024 * 1024 * 1024,
    version: '1.2.5',
    weight: 95,
    price: 18,
    currency: 'USD',
    tags: 'CN2-GIA,BGP,UltraLowLatency',
    group: 'Asia Pacific',
    billing_cycle: 30,
    traffic_limit: 3 * 1024 * 1024 * 1024 * 1024,
    traffic_limit_type: 'sum',
    expired_at: '2027-12-31T23:59:59Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
    ipv4: '203.0.113.112',
    ipv6: '2001:db8:hk::1'
  }
};

// Ping Tasks
const initialPingTasks = [
  { id: 1, name: 'Cloudflare Anycast (1.1.1.1)', host: '1.1.1.1', type: 'icmp', interval: 60 },
  { id: 2, name: 'Google Public DNS (8.8.8.8)', host: '8.8.8.8', type: 'icmp', interval: 60 },
  { id: 3, name: 'Bilibili CDN', host: 'api.bilibili.com', type: 'tcp', port: 443, interval: 60 }
];

// Helper to generate live status with realistic fluctuations
function getLiveStatus(): Record<string, any> {
  const now = Date.now();
  const timeSec = now / 1000;
  const status: Record<string, any> = {};

  const nodes = Object.values(initialNodes);
  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx];
    const uuid = node.uuid;
    const wave = Math.sin(timeSec * 0.5 + idx);
    const wave2 = Math.cos(timeSec * 0.3 + idx);

    const baseCpu = 12 + idx * 8;
    const cpuUsage = Math.max(5, Math.min(95, +(baseCpu + wave * 9).toFixed(1)));
    
    const ramPercent = 0.35 + (idx * 0.08) + wave2 * 0.05;
    const ramUsed = Math.floor(node.mem_total * ramPercent);
    const swapUsed = Math.floor(node.swap_total * 0.08);

    const diskUsed = Math.floor(node.disk_total * (0.38 + idx * 0.05));

    const netUpSpeed = Math.floor(Math.max(10240, (800 + wave * 400 + idx * 300) * 1024));
    const netDownSpeed = Math.floor(Math.max(20480, (2200 + wave2 * 900 + idx * 800) * 1024));

    status[uuid] = {
      online: true,
      client: uuid,
      cpu: { usage: cpuUsage },
      ram: { used: ramUsed },
      swap: { used: swapUsed },
      load: {
        load1: +(0.4 + Math.abs(wave) * 0.5).toFixed(2),
        load5: +(0.35 + Math.abs(wave2) * 0.3).toFixed(2),
        load15: +(0.3 + idx * 0.05).toFixed(2),
      },
      disk: { used: diskUsed },
      network: {
        up: netUpSpeed,
        down: netDownSpeed,
        totalUp: Math.floor(1.2e11 + timeSec * 1e5 * (idx + 1)),
        totalDown: Math.floor(3.8e11 + timeSec * 3e5 * (idx + 1)),
      },
      connections: {
        tcp: 85 + idx * 25 + Math.floor(Math.abs(wave) * 20),
        udp: 22 + idx * 6 + Math.floor(Math.abs(wave2) * 8),
      },
      uptime: 1824000 + Math.floor(timeSec % 86400),
      process: 140 + idx * 20,
      updated_at: new Date().toISOString()
    };
  }

  return status;
}

// Helper to generate ping records
function getPingRecords(): Record<string, any> {
  const records: Record<string, any> = {};
  const baseLatencies: Record<string, number[]> = {
    'node-us-west': [1.2, 1.8, 145.0],
    'node-jp-tokyo': [2.8, 4.5, 32.0],
    'node-de-fra': [3.1, 3.9, 180.0],
    'node-sg-sin': [1.9, 2.7, 65.0],
    'node-hk-edge': [1.1, 2.2, 22.0]
  };

  const now = Date.now();
  for (const [uuid, lats] of Object.entries(baseLatencies)) {
    records[uuid] = lats.map((base, taskIdx) => ({
      task_id: initialPingTasks[taskIdx].id,
      latency: +(base + (Math.sin(now / 2000 + taskIdx) * 0.4)).toFixed(1),
      loss: 0,
      updated_at: new Date().toISOString()
    }));
  }
  return records;
}

// 1. Theme Configuration
app.get('/themes/default/komari-theme.json', (_req, res) => {
  if (fs.existsSync(themeFilePath)) {
    return res.sendFile(themeFilePath);
  }
  res.json(komariThemeData);
});

// 2. Public Info API
app.get('/api/public', (_req, res) => {
  res.json({
    status: 'success',
    data: {
      sitename: 'Komari',
      description: 'A lightweight, self-hosted server monitoring solution',
      theme: 'default',
      theme_settings: {
        display_density: 'normal',
        show_uptime: true,
        show_node_weight: true,
        enable_ping_chart: true
      },
      disable_password_login: false,
      oauth_enable: false,
      oauth_provider: '',
      metric_retention_days: 30,
      private_site: Boolean(appSettings.private_site),
      custom_head: '',
      custom_body: ''
    }
  });
});

// 3. Current User API & 2FA Management
app.get('/api/me', (_req, res) => {
  const user = loadUserAccount();
  res.json({
    username: user.username,
    logged_in: user.logged_in,
    uuid: user.uuid,
    sso_type: user.sso_type || '',
    sso_id: user.sso_id || '',
    '2fa_enabled': Boolean(user['2fa_enabled']),
    status: 'success',
    data: {
      uuid: user.uuid,
      username: user.username,
      role: user.role,
      logged_in: user.logged_in,
      created_at: user.created_at,
      '2fa_enabled': Boolean(user['2fa_enabled'])
    }
  });
});

let pending2FASecret = '';

app.get('/api/admin/2fa/generate', async (_req, res) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < 32; i++) {
    secret += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  pending2FASecret = secret;

  const otpauthUrl = `otpauth://totp/Komari%20Monitor:admin?secret=${secret}&issuer=Komari%20Monitor`;
  try {
    const pngBuffer = await QRCode.toBuffer(otpauthUrl, {
      width: 250,
      margin: 2,
      errorCorrectionLevel: 'M'
    });
    res.cookie('2fa_secret', secret, { maxAge: 1800000, httpOnly: true, path: '/' });
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to generate QR code' });
  }
});

app.get('/api/admin/2fa/info', (_req, res) => {
  const account = loadUserAccount();
  res.json({
    status: 'success',
    data: {
      "2fa_enabled": Boolean(account['2fa_enabled']),
      two_factor_secret: account['2fa_enabled'] ? (account.two_factor || '') : '',
      pending_secret: pending2FASecret || ''
    }
  });
});

app.get('/api/admin/2fa/qrcode', async (_req, res) => {
  const account = loadUserAccount();
  const secret = (account['2fa_enabled'] && account.two_factor) ? account.two_factor : (pending2FASecret || 'JBSWY3DPEHPK3PXP');
  const otpauthUrl = `otpauth://totp/Komari%20Monitor:admin?secret=${secret}&issuer=Komari%20Monitor`;
  try {
    const pngBuffer = await QRCode.toBuffer(otpauthUrl, {
      width: 250,
      margin: 2,
      errorCorrectionLevel: 'M'
    });
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to generate QR code' });
  }
});

app.post('/api/admin/2fa/enable', (req, res) => {
  const code = (req.query.code as string) || (req.body?.code as string) || '';
  const secret = pending2FASecret || 'JBSWY3DPEHPK3PXP';
  if (!code) {
    return res.status(400).json({ status: 'error', message: '2FA secret or code not provided' });
  }
  if (!verifyTOTP(code, secret)) {
    return res.status(400).json({ status: 'error', message: 'Invalid 2FA code' });
  }
  const account = loadUserAccount();
  account['2fa_enabled'] = true;
  account.two_factor = secret;
  saveUserAccount(account);
  res.json({ status: 'success', data: '2FA enabled successfully' });
});

app.post('/api/admin/2fa/disable', (req, res) => {
  const code = get2FACodeFromReq(req);
  const account = loadUserAccount();
  if (account['2fa_enabled'] && account.two_factor && code) {
    if (!verifyTOTP(code, account.two_factor)) {
      return res.status(401).json({ status: 'error', message: '2FA 验证码错误' });
    }
  }
  account['2fa_enabled'] = false;
  account.two_factor = '';
  saveUserAccount(account);
  res.json({ status: 'success', message: '2FA disabled successfully' });
});

// 4. Admin Clients & Ping Endpoints
app.get('/api/admin/client/list', (_req, res) => {
  // Go jsonRpc.Bind("admin:listClients", jsonRpc.WithRaw()) returns raw Client[] array
  res.json(Object.values(initialNodes));
});

app.get('/api/admin/ping', (_req, res) => {
  res.json({
    status: 'success',
    data: initialPingTasks
  });
});

app.get('/api/admin/database/size', (_req, res) => {
  res.json({
    status: 'success',
    data: {
      size: '24.6 MB',
      records: 184500
    }
  });
});

// App Settings In-Memory Store
let appSettings: Record<string, any> = {
  sitename: "Komari",
  description: "A simple server monitor tool.",
  cors_origin_check_enabled: false,
  cors_allowed_origins: "",
  ws_origin_check_enabled: false,
  ws_allowed_origins: "",
  theme: "default",
  private_site: false,
  api_key: "",
  auto_discovery_key: "",
  script_domain: "",
  send_ip_addr_to_guest: false,
  visitor_audit_enabled: false,
  ssrf_protection_enabled: false,
  eula_accepted: true,
  base_scripts_url: "",
  geo_ip_enabled: true,
  geo_ip_provider: "ipinfo",
  o_auth_enabled: false,
  o_auth_provider: "github",
  disable_password_login: false,
  custom_head: "",
  custom_body: "",
  notification_enabled: true,
  notification_method: "none",
  notification_template: "{{emoji}}{{emoji}}{{emoji}}\nEvent: {{event}}\nClients: {{client}}\nMessage: {{message}}\nTime: {{time}}",
  expire_notification_enabled: true,
  expire_notification_lead_days: 7,
  login_notification: true,
  traffic_limit_percentage: 80.0,
  CreatedAt: "2024-01-01T00:00:00Z",
  UpdatedAt: new Date().toISOString()
};

app.get('/api/admin/settings', (_req, res) => {
  res.json({
    status: 'success',
    data: appSettings
  });
});

app.post('/api/admin/settings', (req, res) => {
  if (req.body && typeof req.body === 'object') {
    appSettings = {
      ...appSettings,
      ...req.body,
      UpdatedAt: new Date().toISOString()
    };
  }
  res.json({
    status: 'success',
    data: null,
    message: 'Settings saved successfully'
  });
});

app.get('/api/admin/settings/oidc', (req, res) => {
  const provider = req.query.provider as string;
  if (provider) {
    return res.json({
      status: 'success',
      data: {
        addition: JSON.stringify({
          client_id: '',
          client_secret: '',
          auth_url: '',
          token_url: '',
          user_info_url: ''
        })
      }
    });
  }
  res.json({
    status: 'success',
    data: {
      github: {
        name: 'GitHub',
        fields: {
          client_id: { type: 'string', label: 'Client ID' },
          client_secret: { type: 'password', label: 'Client Secret' }
        }
      },
      google: {
        name: 'Google',
        fields: {
          client_id: { type: 'string', label: 'Client ID' },
          client_secret: { type: 'password', label: 'Client Secret' }
        }
      }
    }
  });
});

app.post('/api/admin/settings/oidc', (_req, res) => {
  res.json({
    status: 'success',
    message: 'Provider settings saved'
  });
});

app.get('/api/admin/settings/xtermjs', (_req, res) => {
  res.json({
    status: 'success',
    data: {
      font_size: 14,
      font_family: 'Menlo, Monaco, "Courier New", monospace',
      theme: 'dark'
    }
  });
});

// Cron Tasks In-Memory Store
interface CronTaskItem {
  id: string;
  name: string;
  command: string;
  schedule_type: 'preset' | 'interval' | 'cron';
  interval_minutes: number;
  cron_expression?: string;
  target_nodes: string[];
  enabled: boolean;
  last_run_at: string | null;
  last_exit_code: number | null;
  last_result: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

const cronFilePath = path.join(process.cwd(), 'komari-web', 'cron-tasks.json');

const initialCronTasks: CronTaskItem[] = [
  {
    id: 'cron-1',
    name: '清理系统临时缓存与日志',
    command: 'journalctl --vacuum-time=3d && rm -rf /tmp/*.log',
    schedule_type: 'preset',
    interval_minutes: 1440,
    target_nodes: ['all'],
    enabled: true,
    last_run_at: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
    last_exit_code: 0,
    last_result: 'Vacuumed 45.2M logs from /var/log/journal. Temporary files cleaned.',
    next_run_at: new Date(Date.now() + 3600 * 1000 * 20).toISOString(),
    created_at: new Date(Date.now() - 86400 * 1000 * 7).toISOString(),
    updated_at: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
  },
  {
    id: 'cron-2',
    name: '检查磁盘与分区空间告警',
    command: "df -h | awk '$5 > 85 {print $0}'",
    schedule_type: 'preset',
    interval_minutes: 60,
    target_nodes: ['all'],
    enabled: true,
    last_run_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    last_exit_code: 0,
    last_result: 'All filesystems normal. Usage healthy (<85%).',
    next_run_at: new Date(Date.now() + 1000 * 60 * 45).toISOString(),
    created_at: new Date(Date.now() - 86400 * 1000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  }
];

function computeNextRunTime(task: Partial<CronTaskItem>, referenceTime: Date = new Date()): string | null {
  if (task.enabled === false) return null;
  const intervalMinutes = Math.max(1, Number(task.interval_minutes) || 30);
  const intervalMs = intervalMinutes * 60 * 1000;
  return new Date(referenceTime.getTime() + intervalMs).toISOString();
}

function ensureValidNextRunAt(task: CronTaskItem, now: Date = new Date()): CronTaskItem {
  if (!task.enabled) {
    return task;
  }
  const intervalMinutes = Math.max(1, Number(task.interval_minutes) || 30);
  const intervalMs = intervalMinutes * 60 * 1000;
  const nowMs = now.getTime();
  const lastMs = task.last_run_at ? new Date(task.last_run_at).getTime() : 0;
  const nextMs = task.next_run_at ? new Date(task.next_run_at).getTime() : 0;

  // Invalid condition: missing, NaN, earlier than or equal to last_run_at, or in the past (<= now)
  if (!nextMs || isNaN(nextMs) || nextMs <= lastMs || nextMs <= nowMs) {
    let nextCandidate = (lastMs > 0 && !isNaN(lastMs)) ? lastMs + intervalMs : nowMs + intervalMs;
    while (nextCandidate <= nowMs) {
      nextCandidate += intervalMs;
    }
    task.next_run_at = new Date(nextCandidate).toISOString();
  }
  return task;
}

function loadCronTasks(): CronTaskItem[] {
  try {
    if (fs.existsSync(cronFilePath)) {
      const content = fs.readFileSync(cronFilePath, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        let changed = false;
        const now = new Date();
        const calibrated = data.map((t: CronTaskItem) => {
          const originalNext = t.next_run_at;
          const fixed = ensureValidNextRunAt(t, now);
          if (fixed.next_run_at !== originalNext) {
            changed = true;
          }
          return fixed;
        });
        if (changed) {
          saveCronTasks(calibrated);
        }
        return calibrated;
      }
    }
  } catch (e) {
    console.error('Error reading cron tasks file:', e);
  }
  // Initialize file with default tasks if not exists
  saveCronTasks(initialCronTasks);
  return [...initialCronTasks];
}

function saveCronTasks(tasks: CronTaskItem[]) {
  try {
    fs.writeFileSync(cronFilePath, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing cron tasks file:', e);
  }
}

let cronTasksList: CronTaskItem[] = loadCronTasks();

function matchTaskId(task: CronTaskItem, queryId: string | string[] | undefined): boolean {
  if (!queryId) return false;
  const qId = Array.isArray(queryId) ? queryId[0] : String(queryId);
  if (task.id === qId) return true;
  const num1 = task.id.replace(/^(cron|task)-/, '');
  const num2 = qId.replace(/^(cron|task)-/, '');
  return num1 === num2 && num1 !== '';
}

// Cron API routes
app.get('/api/admin/cron', (_req, res) => {
  cronTasksList = loadCronTasks();
  res.json({
    status: 'success',
    tasks: cronTasksList,
    data: cronTasksList,
  });
});

app.post('/api/admin/cron', requireSensitive2FA, (req, res) => {
  cronTasksList = loadCronTasks();
  const { name, command, schedule_type, interval_minutes, cron_expression, target_nodes, enabled } = req.body;
  if (!name || !command) {
    return res.status(400).json({ status: 'error', message: 'Task name and command are required.' });
  }
  const isEnabled = enabled !== false;
  const intervalMins = Number(interval_minutes) || 30;
  const newTask: CronTaskItem = {
    id: req.body.id || `cron-${Date.now()}`,
    name,
    command,
    schedule_type: schedule_type || 'preset',
    interval_minutes: intervalMins,
    cron_expression,
    target_nodes: Array.isArray(target_nodes) ? target_nodes : ['all'],
    enabled: isEnabled,
    last_run_at: null,
    last_exit_code: null,
    last_result: null,
    next_run_at: isEnabled ? computeNextRunTime({ interval_minutes: intervalMins, enabled: true }) : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  cronTasksList.unshift(newTask);
  saveCronTasks(cronTasksList);
  res.json({ status: 'success', task: newTask, data: newTask });
});

app.put('/api/admin/cron/:id', requireSensitive2FA, (req, res) => {
  const { id } = req.params;
  cronTasksList = loadCronTasks();
  let idx = cronTasksList.findIndex((t) => matchTaskId(t, id));
  const bodyData = { ...req.body };
  delete bodyData['2fa_code'];
  delete bodyData['two_factor_code'];
  delete bodyData['code'];
  delete bodyData['otp'];

  if (idx === -1) {
    // If not found in existing list, create or append with this id
    const isEnabled = bodyData.enabled !== undefined ? Boolean(bodyData.enabled) : true;
    const intervalMins = Number(bodyData.interval_minutes) || 30;
    const newTask: CronTaskItem = {
      id: String(id),
      name: bodyData.name || '新定时任务',
      command: bodyData.command || 'echo hello',
      schedule_type: bodyData.schedule_type || 'preset',
      interval_minutes: intervalMins,
      cron_expression: bodyData.cron_expression,
      target_nodes: Array.isArray(bodyData.target_nodes) ? bodyData.target_nodes : ['all'],
      enabled: isEnabled,
      last_run_at: null,
      last_exit_code: null,
      last_result: null,
      next_run_at: isEnabled ? computeNextRunTime({ interval_minutes: intervalMins, enabled: true }) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...bodyData,
    };
    cronTasksList.unshift(newTask);
    saveCronTasks(cronTasksList);
    return res.json({ status: 'success', task: newTask, data: newTask });
  }

  const isEnabled = bodyData.enabled !== undefined ? Boolean(bodyData.enabled) : cronTasksList[idx].enabled;
  const intervalMinutes = Number(bodyData.interval_minutes) || cronTasksList[idx].interval_minutes || 30;
  let nextRunAt = cronTasksList[idx].next_run_at;
  if (!isEnabled) {
    nextRunAt = null;
  } else if (!nextRunAt || new Date(nextRunAt).getTime() <= Date.now() || bodyData.interval_minutes !== undefined) {
    nextRunAt = computeNextRunTime({ interval_minutes: intervalMinutes, enabled: true });
  }

  cronTasksList[idx] = {
    ...cronTasksList[idx],
    ...bodyData,
    id: cronTasksList[idx].id, // preserve existing id
    enabled: isEnabled,
    interval_minutes: intervalMinutes,
    next_run_at: nextRunAt,
    updated_at: new Date().toISOString()
  };
  saveCronTasks(cronTasksList);
  res.json({ status: 'success', task: cronTasksList[idx], data: cronTasksList[idx] });
});

app.delete('/api/admin/cron/:id', requireSensitive2FA, (req, res) => {
  const { id } = req.params;
  cronTasksList = loadCronTasks();
  cronTasksList = cronTasksList.filter((t) => !matchTaskId(t, id));
  saveCronTasks(cronTasksList);
  res.json({ status: 'success', message: 'Task deleted successfully' });
});

app.post('/api/admin/cron/:id/toggle', (req, res) => {
  const { id } = req.params;
  cronTasksList = loadCronTasks();
  const task = cronTasksList.find((t) => matchTaskId(t, id));
  if (!task) {
    return res.status(404).json({ status: 'error', message: 'Task not found' });
  }
  task.enabled = req.body.enabled !== undefined ? Boolean(req.body.enabled) : !task.enabled;
  if (task.enabled) {
    task.next_run_at = computeNextRunTime(task);
  } else {
    task.next_run_at = null;
  }
  task.updated_at = new Date().toISOString();
  saveCronTasks(cronTasksList);
  res.json({ status: 'success', enabled: task.enabled, task, data: { enabled: task.enabled, task } });
});

const cronLogsFilePath = path.join(process.cwd(), 'komari-web', 'cron-logs.json');

function loadCronLogs(): Record<string, any[]> {
  try {
    if (fs.existsSync(cronLogsFilePath)) {
      return JSON.parse(fs.readFileSync(cronLogsFilePath, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading cron logs file:', e);
  }
  return {};
}

function saveCronLogs(logs: Record<string, any[]>) {
  try {
    fs.writeFileSync(cronLogsFilePath, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing cron logs file:', e);
  }
}

app.post('/api/admin/cron/:id/run', requireSensitive2FA, (req, res) => {
  const { id } = req.params;
  cronTasksList = loadCronTasks();
  const task = cronTasksList.find((t) => matchTaskId(t, id));
  if (!task) {
    return res.status(404).json({ status: 'error', message: 'Task not found' });
  }
  const now = new Date();
  const nowIso = now.toISOString();
  task.last_run_at = nowIso;
  task.updated_at = nowIso;
  if (task.enabled) {
    task.next_run_at = computeNextRunTime(task, now);
  }
  saveCronTasks(cronTasksList);

  exec(task.command, { timeout: 15000 }, (error, stdout, stderr) => {
    const finishedAt = new Date().toISOString();
    const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
    const output = (stdout || stderr || (error ? error.message : '[Execution completed with no output]')).trim();

    task.last_exit_code = exitCode;
    task.last_result = output;
    saveCronTasks(cronTasksList);

    const allLogs = loadCronLogs();
    const taskLogs = allLogs[task.id] || [];
    taskLogs.unshift({
      id: `log-${Date.now()}`,
      task_id: task.id,
      task_name: task.name,
      node_name: 'Local Server Agent',
      triggered_at: now,
      start_time: now,
      finished_at: finishedAt,
      end_time: finishedAt,
      exit_code: exitCode,
      output: output,
      target_nodes_count: task.target_nodes.includes('all') ? 1 : task.target_nodes.length,
    });
    allLogs[task.id] = taskLogs.slice(0, 50);
    saveCronLogs(allLogs);
  });

  task.last_exit_code = 0;
  task.last_result = `[${new Date().toLocaleTimeString()}] Task dispatched and executing...`;
  saveCronTasks(cronTasksList);
  res.json({ status: 'success', message: 'Task executed successfully', task, data: task });
});

app.get('/api/admin/cron/:id/logs', (req, res) => {
  const { id } = req.params;
  const task = cronTasksList.find((t) => matchTaskId(t, id));
  if (!task) {
    return res.status(404).json({ status: 'error', message: 'Task not found' });
  }
  const allLogs = loadCronLogs();
  let taskLogs = allLogs[task.id] || [];

  if (taskLogs.length === 0) {
    const timeStr = task.last_run_at || new Date().toISOString();
    taskLogs = [
      {
        id: `log-${task.id}-init`,
        task_id: task.id,
        task_name: task.name,
        node_name: 'Local Server Agent',
        triggered_at: timeStr,
        start_time: timeStr,
        finished_at: timeStr,
        end_time: timeStr,
        exit_code: task.last_exit_code ?? 0,
        output: task.last_result || `Command "${task.command}" ready. Click "Run" to execute.`,
        target_nodes_count: task.target_nodes.includes('all') ? 1 : task.target_nodes.length,
      }
    ];
  }

  res.json({
    status: 'success',
    logs: taskLogs,
    data: taskLogs,
  });
});

// Notification Channels Configuration Store
const notificationChannels = [
  {
    id: "telegram",
    configuration: {
      type: "managed",
      name: { en: "Telegram", "zh-CN": "Telegram", ja: "Telegram" },
      data: [
        { key: "bot_token", name: "Bot Token", type: "string", required: true, help: "Telegram Bot API Token" },
        { key: "chat_id", name: "Chat ID", type: "string", required: true, help: "Target Chat ID / Group ID" },
        { key: "message_thread_id", name: "Message Thread ID", type: "string", required: false, help: "Optional message thread id (for supergroups)" },
        { key: "endpoint", name: "API Endpoint", type: "string", required: true, default: "https://api.telegram.org/bot", help: "Telegram API endpoint" },
      ]
    }
  },
  {
    id: "bark",
    configuration: {
      type: "managed",
      name: { en: "Bark", "zh-CN": "Bark", ja: "Bark" },
      data: [
        { key: "server_url", name: "Server URL", type: "string", required: true, default: "https://api.day.app", help: "Bark server URL" },
        { key: "device_key", name: "Device Key", type: "string", required: true, help: "Your Bark device key" },
        { key: "icon", name: "Icon", type: "string", required: false, help: "Push notification icon URL" },
        { key: "level", name: "Level", type: "option", default: "timeSensitive", options: "active,timeSensitive,passive,critical", help: "Push notification level" },
      ]
    }
  },
  {
    id: "webhook",
    configuration: {
      type: "managed",
      name: { en: "Webhook", "zh-CN": "自定义 Webhook", ja: "Webhook" },
      data: [
        { key: "url", name: "URL", type: "string", required: true, help: "Webhook destination URL" },
        { key: "method", name: "HTTP Method", type: "option", default: "POST", options: "POST,GET,PUT", help: "HTTP Method" },
        { key: "headers", name: "Headers", type: "richtext", required: false, help: "Custom HTTP Headers (JSON format)" },
        { key: "body_template", name: "Body Template", type: "richtext", required: false, help: "Custom Request Body Template" },
      ]
    }
  },
  {
    id: "email",
    configuration: {
      type: "managed",
      name: { en: "Email (SMTP)", "zh-CN": "邮件通知 (SMTP)", ja: "メール" },
      data: [
        { key: "smtp_host", name: "SMTP Host", type: "string", required: true, help: "SMTP Server Host (e.g. smtp.gmail.com)" },
        { key: "smtp_port", name: "SMTP Port", type: "string", required: true, default: "465", help: "SMTP Port (e.g. 465 / 587)" },
        { key: "username", name: "Username", type: "string", required: true, help: "SMTP Username / Email" },
        { key: "password", name: "Password", type: "string", required: true, help: "SMTP Password / Auth Code" },
        { key: "to", name: "Recipient", type: "string", required: true, help: "Recipient Email Address" },
      ]
    }
  },
  {
    id: "serverchan3",
    configuration: {
      type: "managed",
      name: { en: "ServerChan3", "zh-CN": "Server酱3", ja: "ServerChan3" },
      data: [
        { key: "sendkey", name: "SendKey", type: "string", required: true, help: "ServerChan SendKey" },
      ]
    }
  },
  {
    id: "serverchanturbo",
    configuration: {
      type: "managed",
      name: { en: "ServerChan Turbo", "zh-CN": "Server酱·Turbo", ja: "ServerChan Turbo" },
      data: [
        { key: "sendkey", name: "SendKey", type: "string", required: true, help: "ServerChan Turbo SendKey" },
      ]
    }
  }
];

const savedChannelConfigurations: Record<string, Record<string, any>> = {
  telegram: {
    endpoint: "https://api.telegram.org/bot",
    bot_token: "",
    chat_id: ""
  },
  bark: {
    server_url: "https://api.day.app",
    device_key: "",
    level: "timeSensitive"
  },
  webhook: {
    method: "POST",
    url: "https://example.com/api/webhook"
  },
  email: {
    smtp_port: "465",
    smtp_host: "smtp.example.com"
  }
};

// 5. JSON-RPC 2.0 Dispatcher (HTTP POST & WebSocket)
function handleRpcCall(method: string, params: any): any {
  switch (method) {
    case 'common:getVersion':
      return { version: '1.2.5', hash: 'c82753e' };

    case 'common:getNodes':
      return initialNodes;

    case 'common:getNodesLatestStatus':
      return getLiveStatus();

    case 'common:getPingTasks':
      return initialPingTasks;

    case 'common:getPingRecords':
      return getPingRecords();

    case 'getStatus':
      return { status: 'healthy', version: '1.2.5', nodes: Object.keys(initialNodes).length };

    case 'getNodes':
      return Object.values(initialNodes);

    case 'admin:listNotificationChannels':
      return notificationChannels;

    case 'admin:getNotificationChannelConfiguration': {
      const channelId = (params as any)?.id || (params as any)?.provider || '';
      const ch = notificationChannels.find((c) => c.id === channelId);
      return {
        configuration: ch?.configuration || { type: 'managed', name: channelId, data: [] },
        data: savedChannelConfigurations[channelId] || {}
      };
    }

    case 'admin:setNotificationChannelConfiguration': {
      const { id: channelId, data } = (params as any) || {};
      if (channelId && data) {
        savedChannelConfigurations[channelId] = data;
      }
      return { message: 'Notification channel configuration saved successfully' };
    }

    case 'admin:testSendMessage':
      return { status: 'success', message: 'Test notification message sent successfully' };

    case 'admin:getPlugins':
    case 'admin:listPlugins':
      return [];

    default:
      return { status: 'success', method };
  }
}

// HTTP POST /api/rpc2
app.post('/api/rpc2', (req, res) => {
  const body = req.body || {};
  const isBatch = Array.isArray(body);

  if (isBatch) {
    const responses = body.map((item) => ({
      jsonrpc: '2.0',
      id: item.id ?? null,
      result: handleRpcCall(item.method, item.params)
    }));
    return res.json(responses);
  }

  const { method, params, id } = body;
  const result = handleRpcCall(method, params);
  res.json({
    jsonrpc: '2.0',
    id: id ?? 1,
    result
  });
});

// 6. Serve komari-web official static assets
const distPath = path.join(process.cwd(), 'komari-web', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Fallback if not built yet
  app.get('/', (_req, res) => {
    res.send('Komari Web Panel is loading...');
  });
}

// 7. Start HTTP Server & WebSocket Server for real-time telemetry
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/rpc2' });

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.method) {
        const result = handleRpcCall(msg.method, msg.params);
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id ?? 1,
          result
        }));
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  // Send periodic live data updates
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'live:update',
        params: getLiveStatus()
      }));
    }
  }, 2000);

  ws.on('close', () => clearInterval(interval));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Komari Monitor] Server running on http://0.0.0.0:${PORT}`);
});

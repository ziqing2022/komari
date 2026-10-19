import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  Flex,
  Text,
  Badge,
  TextField,
  Dialog,
  IconButton,
  Switch,
  Select,
} from "@radix-ui/themes";
import {
  Network,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Server,
  ArrowRight,
  Globe,
  Radio,
  Search,
  Copy,
  Sparkles,
  Zap,
  KeyRound,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { NodeDetailsProvider, useNodeDetails, type NodeDetail } from "@/contexts/NodeDetailsContext";
import Loading from "@/components/loading";

export type RuleType = "forward" | "vless" | "socks5" | "shadowsocks" | "trojan" | "hysteria2";

export interface TunnelRule {
  id: string;
  client_uuid: string;
  name: string;
  rule_type: RuleType;
  listen_port: number;
  protocol: "tcp" | "udp" | "both";
  target_type: "local" | "custom";
  target_host: string;
  target_port: number;
  auto_open_firewall: boolean;
  enabled: boolean;
  status?: string;

  // 高级协议字段
  uuid?: string;
  password?: string;
  username?: string;
  method?: string;
  sni?: string;
  private_key?: string;
  public_key?: string;
  short_id?: string;
  fingerprint?: string;

  created_at: string;
  updated_at: string;
}

const LOCAL_STORAGE_KEY = "komari_tunnel_rules";
const LOCAL_STORAGE_INIT_KEY = "komari_tunnel_initialized";

const TunnelPage = () => {
  return (
    <NodeDetailsProvider>
      <TunnelContent />
    </NodeDetailsProvider>
  );
};

const TunnelContent = () => {
  const { t } = useTranslation();
  const { nodeDetail } = useNodeDetails();

  const [tunnels, setTunnels] = useState<TunnelRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [selectedServerFilter, setSelectedServerFilter] = useState<string>("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");

  // Edit / Create Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TunnelRule | null>(null);

  // Form states
  const [formClientUUID, setFormClientUUID] = useState("");
  const [formName, setFormName] = useState("");
  const [formRuleType, setFormRuleType] = useState<RuleType>("forward");
  const [formListenPort, setFormListenPort] = useState<number | "">("");
  const [formProtocol, setFormProtocol] = useState<"tcp" | "udp" | "both">("tcp");
  const [formTargetType, setFormTargetType] = useState<"local" | "custom">("local");
  const [formTargetHost, setFormTargetHost] = useState("127.0.0.1");
  const [formTargetPort, setFormTargetPort] = useState<number | "">("");
  const [formAutoOpenFirewall, setFormAutoOpenFirewall] = useState(true);
  const [formEnabled, setFormEnabled] = useState(true);

  // Advanced protocol fields
  const [formUUID, setFormUUID] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formMethod, setFormMethod] = useState("2022-blake3-aes-128-gcm");
  const [formSNI, setFormSNI] = useState("gateway.icloud.com");
  const [formPrivateKey, setFormPrivateKey] = useState("");
  const [formPublicKey, setFormPublicKey] = useState("");
  const [formShortID, setFormShortID] = useState("");
  const [formFingerprint, setFormFingerprint] = useState("ios");

  const [form2FaCode, setForm2FaCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingKeys, setGeneratingKeys] = useState(false);

  // Delete Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<TunnelRule | null>(null);
  const [delete2FaCode, setDelete2FaCode] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Fetch 2FA status
  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => {
        const user = data?.data || data;
        setTwoFaEnabled(Boolean(user?.["2fa_enabled"]));
      })
      .catch(() => {
        setTwoFaEnabled(false);
      });
  }, []);

  // Fetch Tunnels
  const loadTunnels = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tunnel");
      if (res.ok) {
        const json = await res.json();
        let loadedRules: TunnelRule[] | null = null;
        if (Array.isArray(json?.rules)) {
          loadedRules = json.rules;
        } else if (Array.isArray(json?.data)) {
          loadedRules = json.data;
        }

        if (loadedRules !== null) {
          setTunnels(loadedRules);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(loadedRules));
          localStorage.setItem(LOCAL_STORAGE_INIT_KEY, "true");
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to load tunnels from API, falling back to local storage", e);
    } finally {
      setLoading(false);
    }

    // Fallback: Read from localStorage
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      const isInitialized = localStorage.getItem(LOCAL_STORAGE_INIT_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setTunnels(parsed);
          return;
        }
      }
      if (isInitialized === "true") {
        setTunnels([]);
        return;
      }
    } catch (e) {
      console.warn("Error reading tunnels from localStorage", e);
    }

    setTunnels([]);
  };

  useEffect(() => {
    loadTunnels();
  }, []);

  // Map client uuid to server object
  const serverMap = useMemo(() => {
    const map = new Map<string, NodeDetail>();
    if (Array.isArray(nodeDetail)) {
      nodeDetail.forEach((node) => {
        if (node?.uuid) {
          map.set(node.uuid, node);
        }
      });
    }
    return map;
  }, [nodeDetail]);

  // One-click key / credentials generator
  const handleGenerateCredentials = async () => {
    setGeneratingKeys(true);
    try {
      const res = await fetch("/api/admin/tunnel/generate_keys");
      if (res.ok) {
        const json = await res.json();
        const data = json?.data || {};
        if (data.uuid) setFormUUID(data.uuid);
        if (data.private_key) setFormPrivateKey(data.private_key);
        if (data.public_key) setFormPublicKey(data.public_key);
        if (data.short_id) setFormShortID(data.short_id);
        if (data.password) setFormPassword(data.password);
        if (data.fingerprint) setFormFingerprint(data.fingerprint);
        if (data.default_sni && !formSNI) setFormSNI(data.default_sni);
        toast.success("已成功生成随机 UUID、X25519 秘钥对及凭据！");
        return;
      }
    } catch (e) {
      console.warn("Failed to fetch keys from backend, generating locally", e);
    } finally {
      setGeneratingKeys(false);
    }

    // Client-side fallback generator
    const genHex = (bytes: number) => {
      const arr = new Uint8Array(bytes);
      crypto.getRandomValues(arr);
      return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
    };
    const genUUID = () => {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    setFormUUID(genUUID());
    setFormShortID(genHex(4));
    setFormPassword(genHex(8));
    if (!formSNI) setFormSNI("gateway.icloud.com");
    toast.success("已通过本地生成安全随机凭据");
  };

  // Open Create Dialog
  const handleOpenCreate = (defaultType: RuleType = "forward") => {
    setEditingRule(null);
    const defaultClient = nodeDetail && nodeDetail.length > 0 ? nodeDetail[0].uuid : "";
    setFormClientUUID(selectedServerFilter !== "all" ? selectedServerFilter : defaultClient);
    setFormName("");
    setFormRuleType(defaultType);
    setFormListenPort(defaultType === "vless" ? 443 : "");
    setFormProtocol("tcp");
    setFormTargetType("local");
    setFormTargetHost("127.0.0.1");
    setFormTargetPort("");
    setFormAutoOpenFirewall(true);
    setFormEnabled(true);

    // Protocol specifics
    setFormUUID("");
    setFormPassword("");
    setFormUsername("");
    setFormMethod("2022-blake3-aes-128-gcm");
    setFormSNI("gateway.icloud.com");
    setFormPrivateKey("");
    setFormPublicKey("");
    setFormShortID("");
    setFormFingerprint("ios");
    setForm2FaCode("");

    // Auto-generate keys for vless
    if (defaultType === "vless" || defaultType === "shadowsocks" || defaultType === "socks5") {
      setTimeout(() => handleGenerateCredentials(), 100);
    }

    setEditDialogOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (rule: TunnelRule) => {
    setEditingRule(rule);
    setFormClientUUID(rule.client_uuid);
    setFormName(rule.name);
    setFormRuleType(rule.rule_type || "forward");
    setFormListenPort(rule.listen_port);
    setFormProtocol(rule.protocol);
    setFormTargetType(rule.target_type || "local");
    setFormTargetHost(rule.target_host || "127.0.0.1");
    setFormTargetPort(rule.target_port);
    setFormAutoOpenFirewall(rule.auto_open_firewall !== false);
    setFormEnabled(rule.enabled);

    setFormUUID(rule.uuid || "");
    setFormPassword(rule.password || "");
    setFormUsername(rule.username || "");
    setFormMethod(rule.method || "2022-blake3-aes-128-gcm");
    setFormSNI(rule.sni || "gateway.icloud.com");
    setFormPrivateKey(rule.private_key || "");
    setFormPublicKey(rule.public_key || "");
    setFormShortID(rule.short_id || "");
    setFormFingerprint(rule.fingerprint || "ios");
    setForm2FaCode("");
    setEditDialogOpen(true);
  };

  // Save Rule
  const handleSaveRule = async () => {
    if (!formClientUUID) {
      toast.error(t("tunnel.selectServer", "请选择服务器节点"));
      return;
    }
    if (!formName.trim()) {
      toast.error(t("tunnel.ruleNamePlaceholder", "请输入规则名称"));
      return;
    }
    const listenPortNum = Number(formListenPort);
    if (!listenPortNum || listenPortNum < 1 || listenPortNum > 65535) {
      toast.error("请输入有效的监听端口 (1-65535)");
      return;
    }

    if (formRuleType === "forward") {
      const targetPortNum = Number(formTargetPort) || listenPortNum;
      if (targetPortNum < 1 || targetPortNum > 65535) {
        toast.error("请输入有效的目标端口 (1-65535)");
        return;
      }
      if (formTargetType === "custom" && !formTargetHost.trim()) {
        toast.error(t("tunnel.targetHostPlaceholder", "请输入自定义目标地址"));
        return;
      }
    } else if (formRuleType === "vless") {
      if (!formUUID.trim()) {
        toast.error("VLESS 协议需要配置 UUID，可点击「一键生成」");
        return;
      }
      if (!formPrivateKey.trim()) {
        toast.error("REALITY 模式需要配置私钥，可点击「一键生成」");
        return;
      }
    } else if (formRuleType === "shadowsocks" || formRuleType === "trojan" || formRuleType === "hysteria2") {
      if (!formPassword.trim()) {
        toast.error("该协议需要设置密码，可点击「一键生成」");
        return;
      }
    }

    const clean2FaCode = form2FaCode.replace(/[\s-]/g, "").trim();
    if (twoFaEnabled && !clean2FaCode) {
      toast.error(t("account.otp_empty_error", "请输入动态口令"));
      return;
    }

    setSaving(true);
    const ruleData = {
      client_uuid: formClientUUID,
      name: formName.trim(),
      rule_type: formRuleType,
      listen_port: listenPortNum,
      protocol: formProtocol,
      target_type: formTargetType,
      target_host: formTargetType === "local" ? "127.0.0.1" : formTargetHost.trim(),
      target_port: Number(formTargetPort) || listenPortNum,
      auto_open_firewall: formAutoOpenFirewall,
      enabled: formEnabled,
      uuid: formUUID.trim(),
      password: formPassword.trim(),
      username: formUsername.trim(),
      method: formMethod.trim(),
      sni: formSNI.trim() || "gateway.icloud.com",
      private_key: formPrivateKey.trim(),
      public_key: formPublicKey.trim(),
      short_id: formShortID.trim(),
      fingerprint: formFingerprint,
    };

    try {
      const url = editingRule
        ? `/api/admin/tunnel/${encodeURIComponent(editingRule.id)}`
        : "/api/admin/tunnel";
      const method = editingRule ? "PUT" : "POST";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (clean2FaCode) {
        headers["X-2FA-Code"] = clean2FaCode;
      }

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({
          ...ruleData,
          "2fa_code": clean2FaCode || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || (res.status === 401 ? "2FA 验证码错误" : `保存失败 (${res.status})`));
      }

      const resData = await res.json().catch(() => ({}));
      const savedRule: TunnelRule = resData.data || {
        ...ruleData,
        id: editingRule ? editingRule.id : `tunnel-${Date.now()}`,
        status: "active",
        created_at: editingRule ? editingRule.created_at : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setTunnels((prev) => {
        const nextRules = editingRule
          ? prev.map((r) => (r.id === editingRule.id ? { ...r, ...savedRule } : r))
          : [savedRule, ...prev];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextRules));
        localStorage.setItem(LOCAL_STORAGE_INIT_KEY, "true");
        return nextRules;
      });

      setEditDialogOpen(false);
      setForm2FaCode("");
      toast.success(t("tunnel.saveSuccess", "规则已成功保存并实时下发至 Agent"));
      loadTunnels();
    } catch (err: any) {
      console.warn("API save error:", err);
      toast.error(err.message || t("common.error", "保存失败，请检查验证码"));
    } finally {
      setSaving(false);
    }
  };

  // Toggle Rule Status
  const handleToggleStatus = async (rule: TunnelRule) => {
    const nextStatus = !rule.enabled;
    const targetId = rule.id;

    try {
      const res = await fetch(`/api/admin/tunnel/${encodeURIComponent(targetId)}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "更新状态失败");
      }

      setTunnels((prev) => {
        const updated = prev.map((r) =>
          r.id === targetId ? { ...r, enabled: nextStatus, updated_at: new Date().toISOString() } : r
        );
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
      toast.success(t("tunnel.statusUpdated", "隧道状态已更新"));
      loadTunnels();
    } catch (e: any) {
      console.warn("API toggle error:", e);
      toast.error(e.message || "更新状态失败");
    }
  };

  // Delete Rule
  const handleOpenDelete = (rule: TunnelRule) => {
    setRuleToDelete(rule);
    setDelete2FaCode("");
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!ruleToDelete) return;
    const clean2FaCode = delete2FaCode.replace(/[\s-]/g, "").trim();

    if (twoFaEnabled && !clean2FaCode) {
      toast.error(t("account.otp_empty_error", "请输入动态口令"));
      return;
    }

    setDeleting(true);
    const targetId = ruleToDelete.id;

    try {
      const headers: Record<string, string> = {};
      if (clean2FaCode) {
        headers["X-2FA-Code"] = clean2FaCode;
      }

      const res = await fetch(`/api/admin/tunnel/${encodeURIComponent(targetId)}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || (res.status === 401 ? "2FA 验证码错误" : "删除失败"));
      }

      setTunnels((prev) => {
        const filtered = prev.filter((r) => r.id !== targetId);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
        return filtered;
      });

      setDeleteDialogOpen(false);
      setDelete2FaCode("");
      toast.success(t("tunnel.deleteSuccess", "规则已删除，Agent 端口及防火墙已清理"));
      loadTunnels();
    } catch (e: any) {
      console.warn("API delete error:", e);
      toast.error(e.message || "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // Copy Client Node / Share Link
  const handleCopyShareLink = (rule: TunnelRule) => {
    const server = serverMap.get(rule.client_uuid);
    const serverHost = server?.ipv4 || server?.ipv6 || server?.name || "127.0.0.1";
    let shareLink = "";

    const ruleType = rule.rule_type || "forward";
    const nameTag = encodeURIComponent(rule.name);

    if (ruleType === "vless") {
      const sni = rule.sni || "gateway.icloud.com";
      const pbk = rule.public_key || "";
      const sid = rule.short_id || "";
      const fp = rule.fingerprint || "ios";
      shareLink = `vless://${rule.uuid}@${serverHost}:${rule.listen_port}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${sni}&fp=${fp}&pbk=${pbk}&sid=${sid}&type=tcp#${nameTag}`;
    } else if (ruleType === "socks5") {
      if (rule.password) {
        shareLink = `socks5://${rule.username || "komari"}:${rule.password}@${serverHost}:${rule.listen_port}#${nameTag}`;
      } else {
        shareLink = `socks5://${serverHost}:${rule.listen_port}#${nameTag}`;
      }
    } else if (ruleType === "shadowsocks") {
      const method = rule.method || "2022-blake3-aes-128-gcm";
      const userinfo = btoa(`${method}:${rule.password}`);
      shareLink = `ss://${userinfo}@${serverHost}:${rule.listen_port}#${nameTag}`;
    } else if (ruleType === "trojan") {
      const sni = rule.sni || "gateway.icloud.com";
      shareLink = `trojan://${rule.password}@${serverHost}:${rule.listen_port}?security=tls&sni=${sni}#${nameTag}`;
    } else if (ruleType === "hysteria2") {
      const sni = rule.sni || "gateway.icloud.com";
      shareLink = `hysteria2://${rule.password}@${serverHost}:${rule.listen_port}?sni=${sni}&insecure=1#${nameTag}`;
    } else {
      // forward
      shareLink = `${serverHost}:${rule.listen_port}`;
    }

    navigator.clipboard.writeText(shareLink);
    toast.success("已复制节点/连接链接到剪贴板！可以直接导入客户端使用。");
  };

  // Filtered tunnels
  const filteredTunnels = useMemo(() => {
    return tunnels.filter((rule) => {
      if (selectedServerFilter !== "all" && rule.client_uuid !== selectedServerFilter) {
        return false;
      }
      if (selectedTypeFilter !== "all" && (rule.rule_type || "forward") !== selectedTypeFilter) {
        return false;
      }
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const serverName = (serverMap.get(rule.client_uuid)?.name || "").toLowerCase();
        const ruleName = (rule.name || "").toLowerCase();
        const targetHost = (rule.target_host || "").toLowerCase();
        const sni = (rule.sni || "").toLowerCase();
        const portStr = `${rule.listen_port} ${rule.target_port}`;
        return (
          serverName.includes(kw) ||
          ruleName.includes(kw) ||
          targetHost.includes(kw) ||
          sni.includes(kw) ||
          portStr.includes(kw)
        );
      }
      return true;
    });
  }, [tunnels, selectedServerFilter, selectedTypeFilter, searchKeyword, serverMap]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <Flex justify="between" align="center" className="flex-wrap gap-4">
        <div>
          <Flex align="center" gap="2">
            <Network className="w-6 h-6 text-blue-500" />
            <Text size="6" weight="bold">
              {t("tunnel.title", "反向代理穿透与节点管理")}
            </Text>
          </Flex>
          <Text size="2" color="gray" className="mt-1 block">
            基于 Sing-box 为服务器节点配置端口映射、VLESS-Reality、Socks5、Shadowsocks 及反向代理通道，全自动放行系统防火墙
          </Text>
        </div>
        <Flex gap="3" align="center">
          <Button variant="soft" onClick={loadTunnels} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh", "刷新")}
          </Button>

          <Button color="blue" onClick={() => handleOpenCreate("vless")}>
            <Sparkles className="w-4 h-4" />
            + VLESS Reality 节点
          </Button>

          <Button onClick={() => handleOpenCreate("forward")}>
            <Plus className="w-4 h-4" />
            {t("tunnel.createTunnel", "新建规则")}
          </Button>
        </Flex>
      </Flex>

      {/* Filter and Search Bar */}
      <Card>
        <Flex gap="4" align="center" className="flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <TextField.Root
              placeholder="搜索规则名称、SNI、端口、目标..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            >
              <TextField.Slot>
                <Search className="w-4 h-4 text-gray-400" />
              </TextField.Slot>
            </TextField.Root>
          </div>

          <div className="min-w-[170px]">
            <Select.Root
              value={selectedServerFilter}
              onValueChange={setSelectedServerFilter}
            >
              <Select.Trigger className="w-full" placeholder={t("tunnel.filterByServer", "按节点筛选")} />
              <Select.Content>
                <Select.Item value="all">{t("tunnel.allServers", "全部节点")}</Select.Item>
                {nodeDetail &&
                  nodeDetail.map((node) => (
                    <Select.Item key={node.uuid} value={node.uuid}>
                      {node.name || node.uuid}
                    </Select.Item>
                  ))}
              </Select.Content>
            </Select.Root>
          </div>

          <div className="min-w-[150px]">
            <Select.Root
              value={selectedTypeFilter}
              onValueChange={setSelectedTypeFilter}
            >
              <Select.Trigger className="w-full" placeholder="按协议类型筛选" />
              <Select.Content>
                <Select.Item value="all">全部协议</Select.Item>
                <Select.Item value="forward">端口转发 (Direct)</Select.Item>
                <Select.Item value="vless">VLESS + REALITY</Select.Item>
                <Select.Item value="socks5">SOCKS5 代理</Select.Item>
                <Select.Item value="shadowsocks">Shadowsocks</Select.Item>
                <Select.Item value="trojan">Trojan</Select.Item>
                <Select.Item value="hysteria2">Hysteria 2</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>

          <Flex gap="2" align="center" className="ml-auto text-sm text-gray-500">
            <span>共 {tunnels.length} 条</span>
            <span>·</span>
            <span>已启用 {tunnels.filter((r) => r.enabled).length} 条</span>
          </Flex>
        </Flex>
      </Card>

      {/* Content Area */}
      {loading && tunnels.length === 0 ? (
        <Loading />
      ) : filteredTunnels.length === 0 ? (
        <Card className="py-12 text-center">
          <div className="flex flex-col items-center justify-center space-y-3">
            <Network className="w-12 h-12 text-gray-400 opacity-60" />
            <Text size="3" color="gray">
              暂无通道或节点规则，点击上方「新建规则」或「+ VLESS Reality 节点」开始配置
            </Text>
            <Flex gap="3">
              <Button color="blue" onClick={() => handleOpenCreate("vless")}>
                <Sparkles className="w-4 h-4 mr-1" />
                创建 VLESS Reality 节点
              </Button>
              <Button variant="soft" onClick={() => handleOpenCreate("forward")}>
                <Plus className="w-4 h-4 mr-1" />
                {t("tunnel.createTunnel", "新建端口转发")}
              </Button>
            </Flex>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredTunnels.map((rule) => {
            const server = serverMap.get(rule.client_uuid);
            const serverName = server?.name || rule.client_uuid;
            const ruleType = rule.rule_type || "forward";

            return (
              <Card key={rule.id} className="p-5 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left Column: Info & Routing Details */}
                  <div className="space-y-3 flex-1 min-w-0">
                    <Flex align="center" gap="2" wrap="wrap">
                      <Text weight="bold" size="4" className="text-gray-900 dark:text-gray-100 truncate">
                        {rule.name}
                      </Text>

                      <Badge color="blue" variant="soft" className="flex items-center gap-1">
                        <Server className="w-3 h-3" />
                        {serverName}
                      </Badge>

                      {/* Protocol Badge */}
                      {ruleType === "vless" && (
                        <Badge color="purple" variant="solid" className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          VLESS REALITY
                        </Badge>
                      )}
                      {ruleType === "socks5" && (
                        <Badge color="cyan" variant="solid">
                          SOCKS5
                        </Badge>
                      )}
                      {ruleType === "shadowsocks" && (
                        <Badge color="amber" variant="solid">
                          Shadowsocks
                        </Badge>
                      )}
                      {ruleType === "hysteria2" && (
                        <Badge color="pink" variant="solid">
                          Hysteria 2
                        </Badge>
                      )}
                      {ruleType === "trojan" && (
                        <Badge color="indigo" variant="solid">
                          Trojan
                        </Badge>
                      )}
                      {ruleType === "forward" && (
                        <Badge color="gray" variant="outline">
                          端口转发 ({rule.protocol.toUpperCase()})
                        </Badge>
                      )}

                      {/* Firewall allowance */}
                      {rule.auto_open_firewall ? (
                        <Badge color="green" variant="soft" className="flex items-center gap-1" title="系统防火墙自动放行">
                          <ShieldCheck className="w-3 h-3 text-green-600" />
                          <span>防火墙已放行</span>
                        </Badge>
                      ) : (
                        <Badge color="gray" variant="soft" className="flex items-center gap-1" title="未自动放行防火墙">
                          <ShieldAlert className="w-3 h-3 text-gray-400" />
                          <span>防火墙未配置</span>
                        </Badge>
                      )}
                    </Flex>

                    {/* Routing or Protocol Details */}
                    <div className="text-sm bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
                      {ruleType === "forward" ? (
                        <Flex align="center" gap="3" wrap="wrap">
                          <div className="flex items-center gap-1.5 font-mono text-blue-600 dark:text-blue-400 font-semibold">
                            <Radio className="w-3.5 h-3.5" />
                            <span>:{rule.listen_port}</span>
                          </div>
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                          <div className="flex items-center gap-2">
                            {rule.target_type !== "custom" ? (
                              <Badge color="amber" variant="soft" className="flex items-center gap-1">
                                <Server className="w-3 h-3" />
                                <span>{t("tunnel.localhost", "本机")}</span>
                              </Badge>
                            ) : (
                              <Badge color="cyan" variant="soft" className="flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                <span>{t("tunnel.remote", "远程")}</span>
                              </Badge>
                            )}
                            <span className="font-mono text-gray-700 dark:text-gray-300 font-medium">
                              {rule.target_host}:{rule.target_port}
                            </span>
                          </div>
                        </Flex>
                      ) : (
                        <Flex align="center" gap="4" wrap="wrap" className="text-xs text-gray-600 dark:text-gray-300">
                          <div className="flex items-center gap-1 font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">
                            <Radio className="w-3.5 h-3.5" />
                            <span>:{rule.listen_port}</span>
                          </div>

                          {ruleType === "vless" && (
                            <>
                              <div>
                                <span className="text-gray-400">SNI / 伪装: </span>
                                <span className="font-mono font-medium text-purple-600 dark:text-purple-400">
                                  {rule.sni || "gateway.icloud.com"}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">UUID: </span>
                                <span className="font-mono">{rule.uuid ? `${rule.uuid.slice(0, 8)}...` : "-"}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">ShortID: </span>
                                <span className="font-mono">{rule.short_id || "-"}</span>
                              </div>
                            </>
                          )}

                          {ruleType === "socks5" && (
                            <div>
                              <span className="text-gray-400">认证: </span>
                              <span>{rule.password ? `用户: ${rule.username || "komari"}` : "无密码认证"}</span>
                            </div>
                          )}

                          {ruleType === "shadowsocks" && (
                            <div>
                              <span className="text-gray-400">加密算法: </span>
                              <span className="font-mono">{rule.method || "2022-blake3-aes-128-gcm"}</span>
                            </div>
                          )}

                          {(ruleType === "trojan" || ruleType === "hysteria2") && (
                            <div>
                              <span className="text-gray-400">伪装域名 (SNI): </span>
                              <span className="font-mono">{rule.sni || "gateway.icloud.com"}</span>
                            </div>
                          )}
                        </Flex>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Status & Controls */}
                  <Flex align="center" gap="3" className="shrink-0 self-end md:self-center">
                    {/* Copy Link Button */}
                    <Button
                      size="2"
                      variant="soft"
                      color="blue"
                      onClick={() => handleCopyShareLink(rule)}
                      title="复制客户端连接链接 / 订阅"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      复制链接
                    </Button>

                    <Flex align="center" gap="2">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggleStatus(rule)}
                        color="green"
                      />
                      <Text size="2" weight="medium" color={rule.enabled ? "green" : "gray"}>
                        {rule.enabled ? t("tunnel.status.active", "生效中") : t("tunnel.status.paused", "已暂停")}
                      </Text>
                    </Flex>

                    <IconButton
                      size="2"
                      variant="soft"
                      color="gray"
                      onClick={() => handleOpenEdit(rule)}
                      title={t("tunnel.editTunnel", "编辑规则")}
                    >
                      <Pencil className="w-4 h-4" />
                    </IconButton>

                    <IconButton
                      size="2"
                      variant="soft"
                      color="red"
                      onClick={() => handleOpenDelete(rule)}
                      title={t("tunnel.deleteTunnel", "删除规则")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </Flex>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog.Root open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <Dialog.Content style={{ maxWidth: 580 }}>
          <Dialog.Title>
            {editingRule ? t("tunnel.editTunnel", "编辑规则") : t("tunnel.createTunnel", "新建隧道或代理节点")}
          </Dialog.Title>
          <Dialog.Description size="2" color="gray" className="mb-4">
            配置 Sing-box 运行规则，支持端口转发与 VLESS-Reality、SOCKS5、Shadowsocks 等主流协议，自动下发并放行防火墙
          </Dialog.Description>

          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {/* Server Node Selection */}
            <div>
              <Text as="label" size="2" weight="bold" className="block mb-1">
                {t("tunnel.server", "所属节点")} *
              </Text>
              <Select.Root
                value={formClientUUID}
                onValueChange={setFormClientUUID}
                disabled={Boolean(editingRule)}
              >
                <Select.Trigger className="w-full" placeholder={t("tunnel.selectServer", "选择服务器节点")} />
                <Select.Content>
                  {nodeDetail &&
                    nodeDetail.map((node) => (
                      <Select.Item key={node.uuid} value={node.uuid}>
                        {node.name || node.uuid} ({node.ipv4 || "IPv4"})
                      </Select.Item>
                    ))}
                </Select.Content>
              </Select.Root>
            </div>

            {/* Protocol Type Selector */}
            <div>
              <Text as="label" size="2" weight="bold" className="block mb-1">
                功能与协议类型 *
              </Text>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "forward", label: "端口转发 (Direct)", icon: Radio },
                  { id: "vless", label: "VLESS + REALITY", icon: Sparkles },
                  { id: "socks5", label: "SOCKS5 代理", icon: KeyRound },
                  { id: "shadowsocks", label: "Shadowsocks", icon: Lock },
                  { id: "trojan", label: "Trojan 代理", icon: ShieldCheck },
                  { id: "hysteria2", label: "Hysteria 2", icon: Zap },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      const nextType = item.id as RuleType;
                      setFormRuleType(nextType);
                      if (nextType === "vless" && (!formListenPort || formListenPort === 8080)) {
                        setFormListenPort(443);
                      }
                      if (nextType === "vless" || nextType === "socks5" || nextType === "shadowsocks") {
                        if (!formUUID && !formPassword) {
                          handleGenerateCredentials();
                        }
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-semibold transition-all ${
                      formRuleType === item.id
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-600 shadow-sm"
                        : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rule Name */}
            <div>
              <Text as="label" size="2" weight="bold" className="block mb-1">
                {t("tunnel.ruleName", "规则名称")} *
              </Text>
              <TextField.Root
                placeholder="例如：新加坡 VLESS Reality / 内网 Web 穿透"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Listen Port */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Text as="label" size="2" weight="bold" className="block mb-1">
                  {t("tunnel.listenPort", "监听端口")} *
                </Text>
                <TextField.Root
                  type="number"
                  placeholder={formRuleType === "vless" ? "443 或 80" : "8080"}
                  value={formListenPort}
                  onChange={(e) => {
                    const val = e.target.value === "" ? "" : Number(e.target.value);
                    setFormListenPort(val);
                    if (formTargetPort === "" || formTargetPort === formListenPort) {
                      setFormTargetPort(val);
                    }
                  }}
                />
              </div>

              {formRuleType === "forward" && (
                <div>
                  <Text as="label" size="2" weight="bold" className="block mb-1">
                    传输协议
                  </Text>
                  <Select.Root
                    value={formProtocol}
                    onValueChange={(val: any) => setFormProtocol(val)}
                  >
                    <Select.Trigger className="w-full" />
                    <Select.Content>
                      <Select.Item value="tcp">TCP</Select.Item>
                      <Select.Item value="udp">UDP</Select.Item>
                      <Select.Item value="both">TCP + UDP</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
              )}

              {formRuleType !== "forward" && (
                <Flex align="end">
                  <Button
                    type="button"
                    variant="soft"
                    color="purple"
                    className="w-full"
                    onClick={handleGenerateCredentials}
                    disabled={generatingKeys}
                  >
                    <Sparkles className={`w-3.5 h-3.5 mr-1 ${generatingKeys ? "animate-spin" : ""}`} />
                    🎲 一键生成凭据密钥
                  </Button>
                </Flex>
              )}
            </div>

            {/* Mode 1: Forwarding Specifics */}
            {formRuleType === "forward" && (
              <div className="space-y-2 border border-gray-100 dark:border-gray-800 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/30">
                <Text as="label" size="2" weight="bold" className="block">
                  {t("tunnel.targetType", "远程目标类型")}
                </Text>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormTargetType("local");
                      setFormTargetHost("127.0.0.1");
                    }}
                    className={`flex items-center justify-center gap-2 p-2 rounded-md border text-sm font-medium transition-colors ${
                      formTargetType === "local"
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <Server className="w-4 h-4" />
                    <span>本机 (127.0.0.1)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormTargetType("custom");
                      if (formTargetHost === "127.0.0.1") {
                        setFormTargetHost("");
                      }
                    }}
                    className={`flex items-center justify-center gap-2 p-2 rounded-md border text-sm font-medium transition-colors ${
                      formTargetType === "custom"
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    <span>自定义目标 (IP / 域名)</span>
                  </button>
                </div>

                {formTargetType === "custom" ? (
                  <div className="pt-2">
                    <Text as="label" size="2" weight="medium" className="block mb-1">
                      {t("tunnel.targetHost", "目标主机")} *
                    </Text>
                    <TextField.Root
                      placeholder={t("tunnel.targetHostPlaceholder", "例如：192.168.1.100 或 example.internal")}
                      value={formTargetHost}
                      onChange={(e) => setFormTargetHost(e.target.value)}
                    />
                  </div>
                ) : (
                  <Text size="1" color="gray" className="block pt-1">
                    将请求直接转发至该小鸡节点本机的指定端口 (127.0.0.1)。
                  </Text>
                )}

                <div className="pt-2">
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    {t("tunnel.targetPort", "目标端口")} *
                  </Text>
                  <TextField.Root
                    type="number"
                    placeholder="例如：80 或 22"
                    value={formTargetPort}
                    onChange={(e) => setFormTargetPort(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
              </div>
            )}

            {/* Mode 2: VLESS REALITY Specifics */}
            {formRuleType === "vless" && (
              <div className="space-y-3 border border-purple-100 dark:border-purple-900/40 p-3.5 rounded-lg bg-purple-50/30 dark:bg-purple-950/20">
                <Flex justify="between" align="center">
                  <Text size="2" weight="bold" color="purple">
                    VLESS + REALITY 核心参数
                  </Text>
                  <Badge color="purple" variant="soft">XTLS-Vision</Badge>
                </Flex>

                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    用户 UUID *
                  </Text>
                  <TextField.Root
                    placeholder="b831381d-6324-4d53-ad4f-8cda48b30811"
                    value={formUUID}
                    onChange={(e) => setFormUUID(e.target.value)}
                  />
                </div>

                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    伪装目标域名 (SNI) *
                  </Text>
                  <TextField.Root
                    placeholder="例如：gateway.icloud.com 或 dl.google.com"
                    value={formSNI}
                    onChange={(e) => setFormSNI(e.target.value)}
                  />
                  <Text size="1" color="gray" className="block mt-1">
                    推荐常用优质 SNI: gateway.icloud.com, itunes.apple.com, dl.google.com
                  </Text>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Text as="label" size="2" weight="medium" className="block mb-1">
                      REALITY 私钥 (Private Key) *
                    </Text>
                    <TextField.Root
                      placeholder="x25519 私钥"
                      value={formPrivateKey}
                      onChange={(e) => setFormPrivateKey(e.target.value)}
                    />
                  </div>

                  <div>
                    <Text as="label" size="2" weight="medium" className="block mb-1">
                      REALITY 公钥 (Public Key)
                    </Text>
                    <TextField.Root
                      placeholder="x25519 公钥 (用于分享)"
                      value={formPublicKey}
                      onChange={(e) => setFormPublicKey(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    Short ID (简短 ID)
                  </Text>
                  <TextField.Root
                    placeholder="例如：6ba85170"
                    value={formShortID}
                    onChange={(e) => setFormShortID(e.target.value)}
                  />
                </div>

                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    TLS 伪装指纹 (Fingerprint)
                  </Text>
                  <Select.Root value={formFingerprint} onValueChange={(val) => setFormFingerprint(val)}>
                    <Select.Trigger className="w-full" />
                    <Select.Content>
                      <Select.Item value="ios">ios (推荐，完美匹配 Apple/iCloud 伪装，避免握手重置)</Select.Item>
                      <Select.Item value="edge">edge (推荐，微软 Edge 浏览器指纹)</Select.Item>
                      <Select.Item value="chrome">chrome (标准 Google Chrome 指纹)</Select.Item>
                      <Select.Item value="random">random (随机浏览器指纹)</Select.Item>
                      <Select.Item value="safari">safari (苹果 Safari 指纹)</Select.Item>
                      <Select.Item value="firefox">firefox (火狐 Firefox 指纹)</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <Text size="1" color="gray" className="block mt-1">
                    注：当 SNI 为 gateway.icloud.com 等苹果域名时，推荐选择 ios 或 edge，可防止 Xray 客户端抗量子扩展引发握手中断。
                  </Text>
                </div>
              </div>
            )}

            {/* Mode 3: SOCKS5 Specifics */}
            {formRuleType === "socks5" && (
              <div className="space-y-3 border border-gray-100 dark:border-gray-800 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/30">
                <Text size="2" weight="bold">
                  SOCKS5 认证设置 (留空则免密)
                </Text>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Text as="label" size="2" weight="medium" className="block mb-1">
                      用户名
                    </Text>
                    <TextField.Root
                      placeholder="默认: komari"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                    />
                  </div>
                  <div>
                    <Text as="label" size="2" weight="medium" className="block mb-1">
                      密码
                    </Text>
                    <TextField.Root
                      placeholder="设置密码"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Mode 4: Shadowsocks Specifics */}
            {formRuleType === "shadowsocks" && (
              <div className="space-y-3 border border-gray-100 dark:border-gray-800 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/30">
                <Text size="2" weight="bold">
                  Shadowsocks 设置
                </Text>
                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    加密方法 (Method)
                  </Text>
                  <Select.Root
                    value={formMethod}
                    onValueChange={setFormMethod}
                  >
                    <Select.Trigger className="w-full" />
                    <Select.Content>
                      <Select.Item value="2022-blake3-aes-128-gcm">2022-blake3-aes-128-gcm (推荐)</Select.Item>
                      <Select.Item value="2022-blake3-aes-256-gcm">2022-blake3-aes-256-gcm</Select.Item>
                      <Select.Item value="2022-blake3-chacha20-poly1305">2022-blake3-chacha20-poly1305</Select.Item>
                      <Select.Item value="aes-128-gcm">aes-128-gcm</Select.Item>
                      <Select.Item value="aes-256-gcm">aes-256-gcm</Select.Item>
                      <Select.Item value="chacha20-ietf-poly1305">chacha20-ietf-poly1305</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    密码 (Password) *
                  </Text>
                  <TextField.Root
                    placeholder="输入或生成密码"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Mode 5: Trojan / Hysteria2 Specifics */}
            {(formRuleType === "trojan" || formRuleType === "hysteria2") && (
              <div className="space-y-3 border border-gray-100 dark:border-gray-800 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/30">
                <Text size="2" weight="bold">
                  {formRuleType.toUpperCase()} 参数设置
                </Text>
                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    访问密码 *
                  </Text>
                  <TextField.Root
                    placeholder="设置连接密码"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </div>
                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    伪装域名 (SNI)
                  </Text>
                  <TextField.Root
                    placeholder="例如：gateway.icloud.com"
                    value={formSNI}
                    onChange={(e) => setFormSNI(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Firewall & Enable Options */}
            <div className="space-y-3 pt-1">
              <Flex justify="between" align="center">
                <div>
                  <Text size="2" weight="bold">
                    {t("tunnel.autoOpenFirewall", "自动放行系统防火墙端口")}
                  </Text>
                  <Text size="1" color="gray" className="block">
                    Agent 会自动在系统防火墙（UFW/Firewalld/Iptables/Netsh）放行该端口
                  </Text>
                </div>
                <Switch
                  checked={formAutoOpenFirewall}
                  onCheckedChange={setFormAutoOpenFirewall}
                  color="green"
                />
              </Flex>

              <Flex justify="between" align="center">
                <div>
                  <Text size="2" weight="bold">
                    {t("tunnel.enable", "保存后立即启用")}
                  </Text>
                  <Text size="1" color="gray" className="block">
                    开启后 Agent 立即下载并启动 Sing-box 代理进程
                  </Text>
                </div>
                <Switch
                  checked={formEnabled}
                  onCheckedChange={setFormEnabled}
                  color="blue"
                />
              </Flex>
            </div>

            {/* 2FA Verification Field if enabled */}
            {twoFaEnabled && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <Text as="label" size="2" weight="bold" color="amber" className="block mb-1">
                  {t("tunnel.twoFaPrompt", "2FA 动态验证码")} *
                </Text>
                <TextField.Root
                  placeholder="请输入 6 位动态验证码"
                  value={form2FaCode}
                  maxLength={6}
                  onChange={(e) => setForm2FaCode(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Dialog Action Buttons */}
          <Flex gap="3" justify="end" className="mt-6">
            <Button variant="soft" color="gray" onClick={() => setEditDialogOpen(false)} disabled={saving}>
              {t("common.cancel", "取消")}
            </Button>
            <Button onClick={handleSaveRule} disabled={saving}>
              {saving && <RefreshCw className="w-4 h-4 mr-1 animate-spin" />}
              {t("common.save", "保存并下发")}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <Dialog.Content style={{ maxWidth: 450 }}>
          <Dialog.Title color="red">
            {t("tunnel.deleteTunnel", "删除规则")}
          </Dialog.Title>
          <Dialog.Description size="2" color="gray" className="mb-4">
            确定要删除该规则吗？Agent 将自动释放监听端口并关闭防火墙放行规则。
          </Dialog.Description>

          {ruleToDelete && (
            <Card className="p-3 mb-4 bg-gray-50 dark:bg-gray-800/50">
              <Text size="2" weight="bold" className="block">
                {ruleToDelete.name}
              </Text>
              <Text size="1" color="gray" className="block font-mono mt-1">
                :{ruleToDelete.listen_port} ({ruleToDelete.rule_type?.toUpperCase() || "FORWARD"})
              </Text>
            </Card>
          )}

          {twoFaEnabled && (
            <div className="mb-4">
              <Text as="label" size="2" weight="bold" color="amber" className="block mb-1">
                {t("tunnel.twoFaPrompt", "2FA 动态验证码")} *
              </Text>
              <TextField.Root
                placeholder="请输入 6 位动态验证码"
                value={delete2FaCode}
                maxLength={6}
                onChange={(e) => setDelete2FaCode(e.target.value)}
              />
            </div>
          )}

          <Flex gap="3" justify="end">
            <Button variant="soft" color="gray" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              {t("common.cancel", "取消")}
            </Button>
            <Button color="red" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting && <RefreshCw className="w-4 h-4 mr-1 animate-spin" />}
              {t("common.confirm", "确定删除")}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
};

export default TunnelPage;

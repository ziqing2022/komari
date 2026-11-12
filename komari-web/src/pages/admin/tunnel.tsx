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
  Popover,
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
  Check,
  ChevronsUpDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { NodeDetailsProvider, useNodeDetails, type NodeDetail } from "@/contexts/NodeDetailsContext";
import Loading from "@/components/loading";

export type RuleType = "forward" | "vless" | "socks5" | "shadowsocks" | "trojan" | "hysteria2" | "tuic";

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
  obfs_password?: string;
  obfs_type?: string;

  // 跨节点反向穿透专用字段
  is_reverse?: boolean;
  bridge_client_uuid?: string;
  bridge_host?: string;
  bridge_port?: number;
  control_port?: number;
  tunnel_secret?: string;

  created_at: string;
  updated_at: string;
}

const LOCAL_STORAGE_KEY = "komari_tunnel_rules";
const LOCAL_STORAGE_INIT_KEY = "komari_tunnel_initialized";

interface ServerComboboxProps {
  nodes: NodeDetail[] | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  allowCustom?: boolean;
  customLabel?: string;
  filterOutUUID?: string;
}

const ServerCombobox = ({
  nodes,
  value,
  onChange,
  disabled = false,
  placeholder = "选择服务器节点",
  allowCustom = false,
  customLabel = "自定义公网机器",
  filterOutUUID,
}: ServerComboboxProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const availableNodes = useMemo(() => {
    if (!nodes) return [];
    if (!filterOutUUID) return nodes;
    return nodes.filter((n) => n?.uuid && n.uuid !== filterOutUUID);
  }, [nodes, filterOutUUID]);

  const filteredNodes = useMemo(() => {
    if (!query.trim()) return availableNodes;
    const q = query.trim().toLowerCase();
    return availableNodes.filter((n) => {
      const name = (n.name || "").toLowerCase();
      const ipv4 = (n.ipv4 || "").toLowerCase();
      const ipv6 = (n.ipv6 || "").toLowerCase();
      const uuid = (n.uuid || "").toLowerCase();
      return name.includes(q) || ipv4.includes(q) || ipv6.includes(q) || uuid.includes(q);
    });
  }, [availableNodes, query]);

  const selectedNode = useMemo(() => {
    if (!value || value === "custom") return null;
    return availableNodes.find((n) => n.uuid === value) || null;
  }, [availableNodes, value]);

  const displayLabel = useMemo(() => {
    if (value === "custom") {
      return customLabel;
    }
    if (selectedNode) {
      return `${selectedNode.name || selectedNode.uuid} (${selectedNode.ipv4 || "无IPv4"})`;
    }
    return placeholder;
  }, [value, selectedNode, customLabel, placeholder]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button
          type="button"
          variant="surface"
          color="gray"
          disabled={disabled}
          className="w-full justify-between font-normal text-left h-9 px-3 cursor-pointer"
        >
          <span className="flex items-center gap-2 truncate text-sm">
            {value === "custom" ? (
              <Globe className="w-4 h-4 text-purple-500 shrink-0" />
            ) : (
              <Server className="w-4 h-4 text-gray-400 shrink-0" />
            )}
            <span className={`truncate ${!value ? "text-gray-400" : "text-gray-900 dark:text-gray-100 font-medium"}`}>
              {displayLabel}
            </span>
          </span>
          <ChevronsUpDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
        </Button>
      </Popover.Trigger>

      <Popover.Content
        align="start"
        sideOffset={4}
        style={{
          width: "var(--radix-popover-trigger-width)",
          minWidth: "min(320px, calc(100vw - 32px))",
          maxWidth: "calc(100vw - 32px)",
        }}
        className="p-2.5 z-50 shadow-lg"
      >
        <div className="mb-2">
          <TextField.Root
            size="2"
            placeholder={t("tunnel.searchServerPlaceholder", "搜索服务器名称或 IP...")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          >
            <TextField.Slot>
              <Search className="w-4 h-4 text-gray-400" />
            </TextField.Slot>
            {query && (
              <TextField.Slot>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </TextField.Slot>
            )}
          </TextField.Root>
        </div>

        <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
          {allowCustom && (
            <div
              onClick={() => {
                onChange("custom");
                setOpen(false);
                setQuery("");
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                value === "custom"
                  ? "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 font-semibold"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Globe className="w-4 h-4 text-purple-500 shrink-0" />
                <span className="truncate">{customLabel}</span>
              </div>
              {value === "custom" && <Check className="w-4 h-4 text-purple-600 shrink-0" />}
            </div>
          )}

          {filteredNodes.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-400">
              {t("tunnel.noServerFound", "未找到匹配的服务器")}
            </div>
          ) : (
            filteredNodes.map((node) => {
              const isSelected = value === node.uuid;
              return (
                <div
                  key={node.uuid}
                  onClick={() => {
                    onChange(node.uuid);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-semibold"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <div className="flex flex-col truncate mr-2">
                    <span className="truncate font-medium">{node.name || node.uuid}</span>
                    <span className="text-[11px] text-gray-400 truncate">
                      {node.ipv4 || node.ipv6 || "无IP"}
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
};

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

  // 跨节点反向穿透字段
  const [formIsReverse, setFormIsReverse] = useState(false);
  const [formBridgeClientUUID, setFormBridgeClientUUID] = useState("");
  const [formBridgeHost, setFormBridgeHost] = useState("");
  const [formBridgePort, setFormBridgePort] = useState<number | "">("");
  const [formControlPort, setFormControlPort] = useState<number | "">(27888);
  const [formTunnelSecret, setFormTunnelSecret] = useState("");
  const [formObfsPassword, setFormObfsPassword] = useState("");

  // SNI 测活状态
  const [sniProbing, setSniProbing] = useState(false);
  const [sniProbeResult, setSniProbeResult] = useState<{
    status?: string;
    tls_version?: string;
    alpn?: string;
    rtt_ms?: number;
    is_tls13?: boolean;
    error?: string;
  } | null>(null);

  const CURATED_SNIS = [
    { name: "微软 Teams", domain: "teams.microsoft.com" },
    { name: "微软 Azure", domain: "azure.microsoft.com" },
    { name: "必应国际", domain: "www.bing.com" },
    { name: "苹果官网", domain: "www.apple.com" },
    { name: "苹果 iCloud", domain: "gateway.icloud.com" },
    { name: "苹果 CDN", domain: "images.apple.com" },
    { name: "亚马逊 AWS", domain: "aws.amazon.com" },
    { name: "Cloudflare", domain: "dash.cloudflare.com" },
    { name: "英伟达", domain: "www.nvidia.com" },
    { name: "甲骨文云", domain: "www.oracle.com" },
  ];

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

  // One-click SNI TLS 1.3 health probe
  const handleProbeSNI = async (targetSni: string) => {
    const sni = (targetSni || "").trim();
    if (!sni) {
      toast.error("请输入或选择伪装域名 (SNI)");
      return;
    }
    setSniProbing(true);
    setSniProbeResult(null);
    try {
      const res = await fetch("/api/admin/tunnel/sni-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sni }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "success") {
        setSniProbeResult(data);
        toast.success(`SNI 测活成功: ${data.tls_version} (${data.alpn || "None"}) - ${data.rtt_ms}ms`);
      } else {
        const errMsg = data.error || data.message || "握手探测失败";
        setSniProbeResult({ status: "error", error: errMsg });
        toast.error(`测活失败: ${errMsg}`);
      }
    } catch (e: any) {
      setSniProbeResult({ status: "error", error: e.message || "网络请求异常" });
      toast.error(`测活异常: ${e.message}`);
    } finally {
      setSniProbing(false);
    }
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
    setFormObfsPassword("");
    setSniProbeResult(null);

    // Reverse specifics
    setFormIsReverse(false);
    setFormBridgeClientUUID("");
    setFormBridgeHost("");
    setFormBridgePort("");
    setFormControlPort(27888);
    setFormTunnelSecret("");

    setForm2FaCode("");

    // Auto-generate keys for vless / tuic
    if (defaultType === "vless" || defaultType === "tuic" || defaultType === "shadowsocks" || defaultType === "socks5") {
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

    // Reverse specifics
    setFormIsReverse(Boolean(rule.is_reverse));
    setFormBridgeClientUUID(rule.bridge_client_uuid || "");
    setFormBridgeHost(rule.bridge_host || "");
    setFormBridgePort(rule.bridge_port || rule.listen_port || "");
    setFormControlPort(rule.control_port || 27888);
    setFormTunnelSecret(rule.tunnel_secret || "");
    setFormObfsPassword(rule.obfs_password || "");
    setSniProbeResult(null);

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
    } else if (formRuleType === "tuic") {
      if (!formUUID.trim()) {
        toast.error("TUIC 协议需要配置 UUID，可点击「一键生成」");
        return;
      }
      if (!formPassword.trim()) {
        toast.error("TUIC 协议需要设置密码，可点击「一键生成」");
        return;
      }
    } else if (formRuleType === "shadowsocks" || formRuleType === "trojan" || formRuleType === "hysteria2") {
      if (!formPassword.trim()) {
        toast.error("该协议需要设置密码，可点击「一键生成」");
        return;
      }
    }

    if (formIsReverse && !formBridgeHost.trim()) {
      toast.error("跨机反向穿透模式必须填写或选择中转机公网 IP / 域名");
      return;
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
      obfs_password: formObfsPassword.trim(),
      obfs_type: "salamander",

      is_reverse: formIsReverse,
      bridge_client_uuid: formBridgeClientUUID,
      bridge_host: formBridgeHost.trim(),
      bridge_port: formIsReverse ? Number(formBridgePort) || listenPortNum : undefined,
      control_port: formIsReverse ? Number(formControlPort) || 27888 : undefined,
      tunnel_secret: formTunnelSecret.trim(),
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

  // Copy Client Node / Share Link (智能计算中转出口)
  const handleCopyShareLink = (rule: TunnelRule) => {
    const server = serverMap.get(rule.client_uuid);
    // 智能公网出口识别：若为跨机反向穿透，自动替换为中转桥接机的公网 IP 与出口端口
    let targetHost = server?.ipv4 || server?.ipv6 || server?.name || "127.0.0.1";
    let targetPort = rule.listen_port;

    if (rule.is_reverse && rule.bridge_host) {
      targetHost = rule.bridge_host;
      targetPort = rule.bridge_port || rule.listen_port;
    }

    let shareLink = "";
    const ruleType = rule.rule_type || "forward";
    const nameTag = encodeURIComponent(rule.name);

    if (ruleType === "vless") {
      const sni = rule.sni || "gateway.icloud.com";
      const pbk = rule.public_key || "";
      const sid = rule.short_id || "";
      const fp = rule.fingerprint || "ios";
      shareLink = `vless://${rule.uuid}@${targetHost}:${targetPort}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${sni}&fp=${fp}&pbk=${pbk}&sid=${sid}&type=tcp#${nameTag}`;
    } else if (ruleType === "tuic") {
      const sni = rule.sni || "gateway.icloud.com";
      shareLink = `tuic://${rule.uuid}:${rule.password}@${targetHost}:${targetPort}?congestion_control=bbr&alpn=h3&sni=${sni}&udp_relay_mode=native&allow_insecure=1&skip-cert-verify=true&insecure=1#${nameTag}`;
    } else if (ruleType === "hysteria2") {
      const sni = rule.sni || "gateway.icloud.com";
      const obfs = rule.obfs_password ? `&obfs=salamander&obfs-password=${rule.obfs_password}` : "";
      shareLink = `hysteria2://${rule.password}@${targetHost}:${targetPort}?sni=${sni}&insecure=1&allow_insecure=1&skip-cert-verify=true${obfs}#${nameTag}`;
    } else if (ruleType === "socks5") {
      if (rule.password) {
        shareLink = `socks5://${rule.username || "komari"}:${rule.password}@${targetHost}:${targetPort}#${nameTag}`;
      } else {
        shareLink = `socks5://${targetHost}:${targetPort}#${nameTag}`;
      }
    } else if (ruleType === "shadowsocks") {
      const method = rule.method || "2022-blake3-aes-128-gcm";
      const userinfo = btoa(`${method}:${rule.password}`);
      shareLink = `ss://${userinfo}@${targetHost}:${targetPort}#${nameTag}`;
    } else if (ruleType === "trojan") {
      const sni = rule.sni || "gateway.icloud.com";
      shareLink = `trojan://${rule.password}@${targetHost}:${targetPort}?security=tls&sni=${sni}#${nameTag}`;
    } else {
      // forward
      shareLink = `${targetHost}:${targetPort}`;
    }

    navigator.clipboard.writeText(shareLink);
    if (rule.is_reverse && rule.bridge_host) {
      toast.success(`已复制节点链接！(已自动绑定中转公网出口 ${targetHost}:${targetPort})`);
    } else {
      toast.success("已复制节点/连接链接到剪贴板！可以直接导入客户端使用。");
    }
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
            {t("tunnel.description", "基于 Sing-box 为服务器节点配置端口映射、VLESS-Reality、Socks5、Shadowsocks 及反向代理通道，全自动放行系统防火墙")}
          </Text>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto mt-2 sm:mt-0">
          <Button variant="soft" onClick={loadTunnels} disabled={loading} className="shrink-0" title={t("common.refresh", "刷新")}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{t("common.refresh", "刷新")}</span>
          </Button>

          <Button color="blue" onClick={() => handleOpenCreate("vless")} className="flex-1 sm:flex-initial">
            <Sparkles className="w-4 h-4" />
            <span>+ VLESS Reality</span>
          </Button>

          <Button onClick={() => handleOpenCreate("forward")} className="flex-1 sm:flex-initial">
            <Plus className="w-4 h-4" />
            <span>{t("tunnel.createTunnel", "新建规则")}</span>
          </Button>
        </div>
      </Flex>

      {/* Filter and Search Bar */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="w-full sm:flex-1 sm:max-w-xs">
            <TextField.Root
              placeholder={t("tunnel.searchPlaceholder", "搜索规则名称、SNI、端口、目标...")}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            >
              <TextField.Slot>
                <Search className="w-4 h-4 text-gray-400" />
              </TextField.Slot>
            </TextField.Root>
          </div>

          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
            <div className="w-full sm:w-44">
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

            <div className="w-full sm:w-36">
              <Select.Root
                value={selectedTypeFilter}
                onValueChange={setSelectedTypeFilter}
              >
                <Select.Trigger className="w-full" placeholder={t("tunnel.allProtocols", "全部协议")} />
                <Select.Content>
                  <Select.Item value="all">{t("tunnel.allProtocols", "全部协议")}</Select.Item>
                  <Select.Item value="forward">{t("tunnel.protocols.forward", "端口转发")}</Select.Item>
                  <Select.Item value="vless">VLESS Reality</Select.Item>
                  <Select.Item value="tuic">TUIC v5</Select.Item>
                  <Select.Item value="hysteria2">Hysteria 2</Select.Item>
                  <Select.Item value="socks5">SOCKS5</Select.Item>
                  <Select.Item value="shadowsocks">Shadowsocks</Select.Item>
                  <Select.Item value="trojan">Trojan</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 text-xs sm:text-sm text-gray-500 sm:ml-auto pt-1 sm:pt-0 border-t border-gray-100 dark:border-gray-800 sm:border-t-0">
            <span>{t("tunnel.totalCount", "共 {{count}} 条", { count: tunnels.length })}</span>
            <span>·</span>
            <span>{t("tunnel.enabledCount", "已启用 {{count}} 条", { count: tunnels.filter((r) => r.enabled).length })}</span>
          </div>
        </div>
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
                      {ruleType === "tuic" && (
                        <Badge color="teal" variant="solid" className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          TUIC v5
                        </Badge>
                      )}
                      {ruleType === "trojan" && (
                        <Badge color="indigo" variant="solid">
                          Trojan
                        </Badge>
                      )}
                      {rule.is_reverse && ruleType !== "forward" && (
                        <Badge color="cyan" variant="soft" className="flex items-center gap-1 font-mono">
                          <Radio className="w-3 h-3 text-cyan-600" />
                          <span>{t("tunnel.transitExit", "跨机出口")}: {rule.bridge_host}:{rule.bridge_port || rule.listen_port}</span>
                        </Badge>
                      )}
                      {ruleType === "forward" && (
                        rule.is_reverse ? (
                          <Badge color="blue" variant="solid" className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            {t("tunnel.transitTag", "跨机反向穿透")}
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="outline">
                            {t("tunnel.protocol", "端口转发")} · {rule.protocol.toUpperCase()}
                          </Badge>
                        )
                      )}

                      {/* Firewall allowance */}
                      {rule.auto_open_firewall ? (
                        <Badge color="green" variant="soft" className="flex items-center gap-1" title={t("tunnel.firewallOpened", "防火墙已放行")}>
                          <ShieldCheck className="w-3 h-3 text-green-600" />
                          <span>{t("tunnel.firewallOpened", "防火墙已放行")}</span>
                        </Badge>
                      ) : (
                        <Badge color="gray" variant="soft" className="flex items-center gap-1" title={t("tunnel.firewallClosed", "防火墙未配置")}>
                          <ShieldAlert className="w-3 h-3 text-gray-400" />
                          <span>{t("tunnel.firewallClosed", "防火墙未配置")}</span>
                        </Badge>
                      )}
                    </Flex>

                    {/* Routing or Protocol Details */}
                    <div className="text-sm bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
                      {ruleType === "forward" ? (
                        rule.is_reverse ? (
                          <Flex align="center" gap="3" wrap="wrap">
                            <div className="flex items-center gap-1.5 font-mono text-purple-700 dark:text-purple-300 font-bold">
                              <Server className="w-4 h-4 text-purple-600" />
                              <span>{t("tunnel.intranetSource", "内网源")} 127.0.0.1:{rule.target_port || rule.listen_port}</span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-blue-500 font-bold" />
                            <div className="flex items-center gap-2">
                              <Badge color="blue" variant="soft" className="flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                <span>{t("tunnel.publicExit", "公网出口")}</span>
                              </Badge>
                              <span className="font-mono text-blue-700 dark:text-blue-300 font-bold">
                                {rule.bridge_host || (rule.bridge_client_uuid && serverMap.get(rule.bridge_client_uuid)?.ipv4) || "公网端"}:{rule.bridge_port || rule.listen_port}
                              </span>
                            </div>
                          </Flex>
                        ) : (
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
                        )
                      ) : (
                        <Flex align="center" gap="4" wrap="wrap" className="text-xs text-gray-600 dark:text-gray-300">
                          <div className="flex items-center gap-1 font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">
                            <Radio className="w-3.5 h-3.5" />
                            <span>:{rule.listen_port}</span>
                          </div>

                          {ruleType === "vless" && (
                            <>
                              <div>
                                <span className="text-gray-400">SNI / {t("tunnel.masquerade", "伪装")}: </span>
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
                              <span className="text-gray-400">{t("tunnel.auth", "认证")}: </span>
                              <span>{rule.password ? `用户: ${rule.username || "komari"}` : t("tunnel.noAuth", "无密码认证")}</span>
                            </div>
                          )}

                          {ruleType === "shadowsocks" && (
                            <div>
                              <span className="text-gray-400">{t("tunnel.encryptionMethod", "加密算法")}: </span>
                              <span className="font-mono">{rule.method || "2022-blake3-aes-128-gcm"}</span>
                            </div>
                          )}

                          {ruleType === "tuic" && (
                            <>
                              <div>
                                <span className="text-gray-400">SNI: </span>
                                <span className="font-mono text-teal-600 dark:text-teal-400">{rule.sni || "gateway.icloud.com"}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">UUID: </span>
                                <span className="font-mono">{rule.uuid ? `${rule.uuid.slice(0, 8)}...` : "-"}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">协议: </span>
                                <span className="font-mono text-xs">h3 / BBR</span>
                              </div>
                            </>
                          )}

                          {ruleType === "hysteria2" && (
                            <>
                              <div>
                                <span className="text-gray-400">SNI: </span>
                                <span className="font-mono text-pink-600">{rule.sni || "gateway.icloud.com"}</span>
                              </div>
                              {rule.obfs_password && (
                                <div>
                                  <span className="text-gray-400">Salamander {t("tunnel.obfsPassword", "混淆密码")}: </span>
                                  <span className="font-mono text-pink-600 font-bold">{rule.obfs_password}</span>
                                </div>
                              )}
                            </>
                          )}

                          {ruleType === "trojan" && (
                            <div>
                              <span className="text-gray-400">SNI / {t("tunnel.masquerade", "伪装")}: </span>
                              <span className="font-mono">{rule.sni || "gateway.icloud.com"}</span>
                            </div>
                          )}
                        </Flex>
                      )}
                    </div>
                  </div>

                  {/* Bottom / Right Column: Status & Controls */}
                  <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-3 w-full md:w-auto pt-2.5 md:pt-0 border-t border-gray-100 dark:border-gray-800 md:border-t-0 shrink-0">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggleStatus(rule)}
                        color="green"
                      />
                      <Text size="2" weight="medium" color={rule.enabled ? "green" : "gray"}>
                        {rule.enabled ? t("tunnel.status.active", "生效中") : t("tunnel.status.paused", "已暂停")}
                      </Text>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Button
                        size="1"
                        variant="soft"
                        color="blue"
                        onClick={() => handleCopyShareLink(rule)}
                        title={t("tunnel.copyLinkTitle", "复制客户端连接链接 / 订阅")}
                        className="text-xs sm:text-sm"
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" />
                        {t("tunnel.copyLink", "复制链接")}
                      </Button>

                      <IconButton
                        size="1"
                        variant="soft"
                        color="gray"
                        onClick={() => handleOpenEdit(rule)}
                        title={t("tunnel.editTunnel", "编辑规则")}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </IconButton>

                      <IconButton
                        size="1"
                        variant="soft"
                        color="red"
                        onClick={() => handleOpenDelete(rule)}
                        title={t("tunnel.deleteTunnel", "删除规则")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog.Root open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <Dialog.Content
          style={{
            maxWidth: "min(580px, calc(100vw - 20px))",
            width: "calc(100vw - 20px)",
            margin: "0 auto",
          }}
          className="p-4 sm:p-6 overflow-hidden"
        >
          <Dialog.Title>
            {editingRule ? t("tunnel.editTunnel", "编辑规则") : t("tunnel.createTunnel", "新建隧道或代理节点")}
          </Dialog.Title>
          <Dialog.Description size="2" color="gray" className="mb-4">
            {t("tunnel.modalDescription", "配置 Sing-box 运行规则，支持端口转发与 VLESS-Reality、SOCKS5、Shadowsocks 等主流协议，自动下发并放行防火墙")}
          </Dialog.Description>

          <div className="space-y-4 max-h-[75vh] overflow-y-auto overflow-x-hidden pr-1">
            {/* Server Node Selection */}
            <div>
              <Text as="label" size="2" weight="bold" className="block mb-1">
                {t("tunnel.server", "所属节点")} *
              </Text>
              <ServerCombobox
                nodes={nodeDetail}
                value={formClientUUID}
                onChange={setFormClientUUID}
                disabled={Boolean(editingRule)}
                placeholder={t("tunnel.selectServer", "选择服务器节点")}
              />
            </div>

            {/* Protocol Type Selector */}
            <div>
              <Text as="label" size="2" weight="bold" className="block mb-1">
                {t("tunnel.protocolType", "功能与协议类型")} *
              </Text>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                {[
                  { id: "forward", label: t("tunnel.protocols.forward", "端口转发"), icon: Radio },
                  { id: "vless", label: "VLESS Reality", icon: Sparkles },
                  { id: "tuic", label: "TUIC v5", icon: Zap },
                  { id: "hysteria2", label: "Hysteria 2", icon: Zap },
                  { id: "shadowsocks", label: "Shadowsocks", icon: Lock },
                  { id: "trojan", label: "Trojan", icon: ShieldCheck },
                  { id: "socks5", label: "SOCKS5", icon: KeyRound },
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
                      if ((nextType === "tuic" || nextType === "hysteria2") && !editingRule) {
                        setFormIsReverse(false);
                      }
                      if (nextType === "vless" || nextType === "tuic" || nextType === "socks5" || nextType === "shadowsocks") {
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
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 网络出口类型 */}
            <div className="space-y-2 border border-blue-200/60 dark:border-blue-900/40 p-3 rounded-lg bg-blue-50/20 dark:bg-blue-950/10">
              <div className="flex items-center justify-between">
                <Text as="label" size="2" weight="bold" className="text-blue-950 dark:text-blue-200">
                  {t("tunnel.networkExitType", "网络出口类型")} *
                </Text>
                <span className="text-[11px] text-gray-500">{t("tunnel.unifiedRuleNote", "统一内网与公网规则")}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormIsReverse(false)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    !formIsReverse
                      ? "border-blue-500 bg-white dark:bg-gray-800 ring-2 ring-blue-500/20 shadow-sm"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 opacity-70"
                  }`}
                >
                  <div className="font-semibold text-xs text-blue-600 dark:text-blue-400">
                    ● {t("tunnel.networkExitDirect", "本机直连出口")}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {t("tunnel.networkExitDirectDesc", "服务器拥有公网 IP，直接对外监听")}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormIsReverse(true)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    formIsReverse
                      ? "border-purple-500 bg-white dark:bg-gray-800 ring-2 ring-purple-500/20 shadow-sm"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 opacity-70"
                  }`}
                >
                  <div className="font-semibold text-xs text-purple-600 dark:text-purple-400">
                    ● {t("tunnel.networkExitReverse", "跨机反向穿透中转")}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {t("tunnel.networkExitReverseDesc", "无公网内网/NAT机器，流量拉到中转机")}
                  </div>
                </button>
              </div>

              {/* TUIC / Hysteria2 UDP Architecture Notice */}
              {(formRuleType === "tuic" || formRuleType === "hysteria2") && formIsReverse && (
                <div className="p-2.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <strong>{t("tunnel.udpNoticeTitle", "UDP 反向穿透已就绪：")}</strong>
                    {t(
                      "tunnel.udpNoticeDesc",
                      "系统已内置预建立工作通道 (UDPPacket) 多路复用穿透引擎，已原生打通 TUIC 与 Hysteria 2 的公网跨机反代暴露。请确保中转机与内网节点的客户端均更新至最新版本。"
                    )}
                  </div>
                </div>
              )}

              {/* 展开跨机中转配置 */}
              {formIsReverse && (
                <div className="mt-2.5 pt-2.5 border-t border-blue-100 dark:border-blue-900/30 space-y-3">
                  <div>
                    <span className="text-xs font-semibold text-purple-900 dark:text-purple-300 block mb-1">
                      {t("tunnel.bridgeServer", "中转服务器")} *
                    </span>
                    <ServerCombobox
                      nodes={nodeDetail}
                      value={formBridgeClientUUID}
                      filterOutUUID={formClientUUID}
                      onChange={(val) => {
                        setFormBridgeClientUUID(val);
                        if (val !== "custom") {
                          const node = serverMap.get(val);
                          if (node?.ipv4) {
                            setFormBridgeHost(node.ipv4);
                          }
                        } else {
                          setFormBridgeHost("");
                        }
                      }}
                      placeholder={t("tunnel.bridgeServerPlaceholder", "请选择公网中转机或自定义")}
                      allowCustom
                      customLabel={t("tunnel.customBridgeServer", "自定义公网机器")}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                        {t("tunnel.bridgeHost", "中转机公网地址")} *
                      </span>
                      <TextField.Root
                        placeholder="例如: 158.179.168.46"
                        value={formBridgeHost}
                        onChange={(e) => setFormBridgeHost(e.target.value)}
                      />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                        {t("tunnel.bridgePort", "中转出口端口")} *
                      </span>
                      <TextField.Root
                        type="number"
                        placeholder="例如: 20988 或 10085"
                        value={formBridgePort}
                        onChange={(e) => setFormBridgePort(e.target.value === "" ? "" : Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Rule Name */}
            <div>
              <Text as="label" size="2" weight="bold" className="block mb-1">
                {t("tunnel.ruleName", "规则名称")} *
              </Text>
              <TextField.Root
                placeholder={t("tunnel.ruleNamePlaceholder", "例如：新加坡 VLESS Reality / 内网 Web 穿透")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Listen Port */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
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
                    {t("tunnel.transportProtocol", "传输协议")}
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
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="soft"
                    color="purple"
                    className="w-full h-9"
                    onClick={handleGenerateCredentials}
                    disabled={generatingKeys}
                  >
                    <Sparkles className={`w-3.5 h-3.5 mr-1 ${generatingKeys ? "animate-spin" : ""}`} />
                    <span className="truncate">🎲 {t("tunnel.generateCredentials", "一键生成凭据密钥")}</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Mode 1: Forwarding Specifics */}
            {formRuleType === "forward" && (
              <div className="space-y-3 border border-gray-100 dark:border-gray-800 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/30">
                <Text size="2" weight="bold">
                  {formIsReverse
                    ? t("tunnel.reverseTargetTitle", "内网反向穿透本地服务目标")
                    : t("tunnel.forwardTargetTitle", "正向端口转发目标")}
                </Text>

                {formIsReverse ? (
                  <div>
                    <Text as="label" size="2" weight="bold" className="block mb-1">
                      {t("tunnel.localServiceTargetPort", "内网本地服务目标端口")} *
                    </Text>
                    <TextField.Root
                      type="number"
                      placeholder="例如：8080 (当前内网机器上的服务端口)"
                      value={formTargetPort}
                      onChange={(e) => setFormTargetPort(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                    <Text size="1" color="gray" className="block mt-1">
                      {t("tunnel.reverseTargetNote", "数据穿透后将送达当前内网节点的 127.0.0.1 目标端口")}
                    </Text>
                  </div>
                ) : (
                  <div className="space-y-2">
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
                        <span>{t("tunnel.targetTypes.local", "本机")}</span>
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
                        <span>{t("tunnel.targetTypes.custom", "自定义目标")}</span>
                      </button>
                    </div>

                    {formTargetType === "custom" ? (
                      <div className="pt-2">
                        <Text as="label" size="2" weight="medium" className="block mb-1">
                          {t("tunnel.targetHost", "目标主机")} *
                        </Text>
                        <TextField.Root
                          placeholder={t("tunnel.targetHostPlaceholder", "例如：192.168.1.100 或 internal.domain")}
                          value={formTargetHost}
                          onChange={(e) => setFormTargetHost(e.target.value)}
                        />
                      </div>
                    ) : (
                      <Text size="1" color="gray" className="block pt-1">
                        {t("tunnel.directForwardNote", "将请求直接转发至该小鸡节点本机的指定端口 (127.0.0.1)。")}
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
              </div>
            )}

            {/* SNI 伪装域名与一键测活组件 (适用所有 TLS 代理协议) */}
            {(formRuleType === "vless" || formRuleType === "trojan" || formRuleType === "tuic" || formRuleType === "hysteria2") && (
              <div className="space-y-2 border border-indigo-100 dark:border-indigo-900/40 p-3 rounded-lg bg-indigo-50/20 dark:bg-indigo-950/20">
                <div className="flex items-center justify-between">
                  <Text as="label" size="2" weight="bold" className="text-indigo-950 dark:text-indigo-200">
                    {t("tunnel.sni", "伪装域名")} *
                  </Text>
                  <Button
                    size="1"
                    variant="soft"
                    color="indigo"
                    type="button"
                    loading={sniProbing}
                    onClick={() => handleProbeSNI(formSNI)}
                  >
                    ⚡ {t("tunnel.sniProbe", "一键测活")}
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <TextField.Root
                      placeholder={t("tunnel.sniPlaceholder", "例如：gateway.icloud.com")}
                      value={formSNI}
                      onChange={(e) => {
                        setFormSNI(e.target.value);
                        setSniProbeResult(null);
                      }}
                    />
                  </div>
                  <div className="w-full sm:w-44 shrink-0">
                    <Select.Root
                      value=""
                      onValueChange={(val) => {
                        if (val) {
                          setFormSNI(val);
                          setSniProbeResult(null);
                          handleProbeSNI(val);
                        }
                      }}
                    >
                      <Select.Trigger className="w-full" placeholder={t("tunnel.sniCandidates", "优质冷门 SNI 库")} />
                      <Select.Content>
                        {CURATED_SNIS.map((s) => (
                          <Select.Item key={s.domain} value={s.domain}>
                            {s.name} ({s.domain})
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                  </div>
                </div>

                {sniProbeResult && (
                  <div className="text-xs flex items-center gap-2 mt-1">
                    {sniProbeResult.status === "success" || sniProbeResult.tls_version ? (
                      <Badge color={sniProbeResult.is_tls13 ? "green" : "amber"} variant="soft">
                        ✓ {sniProbeResult.tls_version} | ALPN: {sniProbeResult.alpn || "None"} | {sniProbeResult.rtt_ms}ms
                      </Badge>
                    ) : (
                      <Badge color="red" variant="soft">
                        ✗ 探测失败: {sniProbeResult.error}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mode 2: VLESS REALITY Specifics */}
            {formRuleType === "vless" && (
              <div className="space-y-3 border border-purple-100 dark:border-purple-900/40 p-3.5 rounded-lg bg-purple-50/30 dark:bg-purple-950/20">
                <Flex justify="between" align="center">
                  <Text size="2" weight="bold" color="purple">
                    {t("tunnel.realitySettings", "REALITY 核心参数")}
                  </Text>
                  <Badge color="purple" variant="soft">XTLS-Vision</Badge>
                </Flex>

                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    {t("tunnel.userUUID", "用户 UUID")} *
                  </Text>
                  <TextField.Root
                    placeholder="b831381d-6324-4d53-ad4f-8cda48b30811"
                    value={formUUID}
                    onChange={(e) => setFormUUID(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div>
                    <Text as="label" size="2" weight="medium" className="block mb-1">
                      {t("tunnel.privateKey", "REALITY 私钥")} *
                    </Text>
                    <TextField.Root
                      placeholder="x25519 私钥"
                      value={formPrivateKey}
                      onChange={(e) => setFormPrivateKey(e.target.value)}
                    />
                  </div>

                  <div>
                    <Text as="label" size="2" weight="medium" className="block mb-1">
                      {t("tunnel.publicKey", "REALITY 公钥")}
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
                    Short ID
                  </Text>
                  <TextField.Root
                    placeholder="例如：6ba85170"
                    value={formShortID}
                    onChange={(e) => setFormShortID(e.target.value)}
                  />
                </div>

                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    {t("tunnel.tlsFingerprint", "TLS 伪装指纹")}
                  </Text>
                  <Select.Root value={formFingerprint} onValueChange={(val) => setFormFingerprint(val)}>
                    <Select.Trigger className="w-full" />
                    <Select.Content>
                      <Select.Item value="ios">ios (推荐，完美匹配 Apple/iCloud 伪装)</Select.Item>
                      <Select.Item value="edge">edge (微软 Edge 浏览器指纹)</Select.Item>
                      <Select.Item value="chrome">chrome (标准 Google Chrome 指纹)</Select.Item>
                      <Select.Item value="random">random (随机浏览器指纹)</Select.Item>
                      <Select.Item value="safari">safari (苹果 Safari 指纹)</Select.Item>
                      <Select.Item value="firefox">firefox (火狐 Firefox 指纹)</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>
            )}

            {/* Mode 3: TUIC v5 Specifics */}
            {formRuleType === "tuic" && (
              <div className="space-y-3 border border-teal-100 dark:border-teal-900/40 p-3.5 rounded-lg bg-teal-50/20 dark:bg-teal-950/20">
                <Flex justify="between" align="center">
                  <Text size="2" weight="bold" color="teal">
                    {t("tunnel.tuicSettings", "TUIC v5 核心参数")}
                  </Text>
                  <Badge color="teal" variant="soft">0-RTT · BBR</Badge>
                </Flex>

                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    {t("tunnel.userUUID", "用户 UUID")} *
                  </Text>
                  <TextField.Root
                    placeholder="用户 UUID"
                    value={formUUID}
                    onChange={(e) => setFormUUID(e.target.value)}
                  />
                </div>

                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    {t("tunnel.accessPassword", "访问密码")} *
                  </Text>
                  <TextField.Root
                    placeholder="连接认证密码"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </div>

                <div className="text-xs text-gray-500">
                  💡 拥塞控制算法默认使用 <strong>BBR</strong>，应用层协议协商 (ALPN) 自动配置为 <strong>h3</strong>，证书自动签发并挂载。
                </div>
              </div>
            )}

            {/* Mode 4: Hysteria 2 Specifics */}
            {formRuleType === "hysteria2" && (
              <div className="space-y-3 border border-pink-100 dark:border-pink-900/40 p-3.5 rounded-lg bg-pink-50/20 dark:bg-pink-950/20">
                <Flex justify="between" align="center">
                  <Text size="2" weight="bold" color="pink">
                    {t("tunnel.hysteria2Settings", "Hysteria 2 混淆配置")}
                  </Text>
                  <Badge color="pink" variant="soft">UDP 加速</Badge>
                </Flex>

                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    {t("tunnel.accessPassword", "访问密码")} *
                  </Text>
                  <TextField.Root
                    placeholder="设置连接密码"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Text as="label" size="2" weight="medium">
                      {t("tunnel.obfsPassword", "Salamander 混淆密码")}
                    </Text>
                    <Button
                      size="1"
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        const rand = Math.random().toString(36).substring(2, 12);
                        setFormObfsPassword(rand);
                      }}
                    >
                      🎲 {t("tunnel.randomGenerate", "随机生成")}
                    </Button>
                  </div>
                  <TextField.Root
                    placeholder="输入混淆密码（建议配置，可有效突破晚高峰 UDP 限速）"
                    value={formObfsPassword}
                    onChange={(e) => setFormObfsPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Mode 5: Trojan Specifics */}
            {formRuleType === "trojan" && (
              <div className="space-y-3 border border-indigo-100 dark:border-indigo-900/40 p-3.5 rounded-lg bg-indigo-50/20 dark:bg-indigo-950/20">
                <Text size="2" weight="bold">
                  {t("tunnel.trojanSettings", "Trojan 参数设置")}
                </Text>
                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    {t("tunnel.accessPassword", "访问密码")} *
                  </Text>
                  <TextField.Root
                    placeholder="设置连接密码"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Mode 6: SOCKS5 Specifics */}
            {formRuleType === "socks5" && (
              <div className="space-y-3 border border-gray-100 dark:border-gray-800 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/30">
                <Text size="2" weight="bold">
                  {t("tunnel.socks5Settings", "SOCKS5 认证设置 (留空免密)")}
                </Text>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div>
                    <Text as="label" size="2" weight="medium" className="block mb-1">
                      {t("tunnel.username", "用户名")}
                    </Text>
                    <TextField.Root
                      placeholder="默认: komari"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                    />
                  </div>
                  <div>
                    <Text as="label" size="2" weight="medium" className="block mb-1">
                      {t("tunnel.password", "密码")}
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

            {/* Mode 7: Shadowsocks Specifics */}
            {formRuleType === "shadowsocks" && (
              <div className="space-y-3 border border-gray-100 dark:border-gray-800 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/30">
                <Text size="2" weight="bold">
                  {t("tunnel.shadowsocksSettings", "Shadowsocks 设置")}
                </Text>
                <div>
                  <Text as="label" size="2" weight="medium" className="block mb-1">
                    {t("tunnel.encryptionMethod", "加密方法")}
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
                    {t("tunnel.password", "密码")} *
                  </Text>
                  <TextField.Root
                    placeholder="输入或生成密码"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
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
                    {t("tunnel.autoOpenFirewallDesc", "Agent 会自动在系统防火墙（UFW/Firewalld/Iptables/Netsh）放行该端口")}
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
                    {t("tunnel.enableImmediately", "保存后立即启用")}
                  </Text>
                  <Text size="1" color="gray" className="block">
                    {t("tunnel.enableImmediatelyDesc", "开启后 Agent 立即下载并启动 Sing-box 代理进程")}
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
              {t("tunnel.saveAndApply", "保存并下发")}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <Dialog.Content
          style={{
            maxWidth: "min(450px, calc(100vw - 20px))",
            width: "calc(100vw - 20px)",
            margin: "0 auto",
          }}
          className="p-4 sm:p-6"
        >
          <Dialog.Title color="red">
            {t("tunnel.deleteTunnel", "删除规则")}
          </Dialog.Title>
          <Dialog.Description size="2" color="gray" className="mb-4">
            {t("tunnel.deleteConfirmDesc", "确定要删除该规则吗？Agent 将自动释放监听端口并关闭防火墙放行规则。")}
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
              {t("tunnel.confirmDelete", "确定删除")}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
};

export default TunnelPage;

import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  Dialog,
  Flex,
  IconButton,
  Badge,
  TextField,
  TextArea,
  Checkbox,
  Text,
} from "@radix-ui/themes";
import {
  Terminal,
  Tag,
  ArrowUpCircle,
  X,
  Play,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useRPC2Call } from "@/contexts/RPC2Context";
import type { NodeSchema } from "./schema/node";

interface BatchOperationsProps {
  selectedNodes: NodeSchema[];
  onClearSelection: () => void;
  onRefresh: () => void;
}

export const BatchOperationsBar: React.FC<BatchOperationsProps> = ({
  selectedNodes,
  onClearSelection,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [groupTagsDialogOpen, setGroupTagsDialogOpen] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);

  if (selectedNodes.length === 0) return null;

  return (
    <>
      <div className="sticky bottom-4 z-30 mx-auto w-full max-w-4xl px-4 py-2 bg-background/95 backdrop-blur border border-border shadow-2xl rounded-xl transition-all animate-in fade-in slide-in-from-bottom-4">
        <Flex justify="between" align="center" wrap="wrap" gap="3">
          <Flex align="center" gap="2">
            <Badge size="2" color="blue" variant="solid">
              {selectedNodes.length}
            </Badge>
            <Text size="2" weight="medium">
              {t("admin.batch.selectedCount", `已选中 {{count}} 台服务器`, {
                count: selectedNodes.length,
              })}
            </Text>
          </Flex>

          <Flex align="center" gap="2" wrap="wrap">
            <Button
              size="2"
              variant="soft"
              onClick={() => setCommandDialogOpen(true)}
            >
              <Terminal size={15} />
              <span>{t("admin.batch.execCommand", "批量执行命令")}</span>
            </Button>

            <Button
              size="2"
              variant="soft"
              onClick={() => setGroupTagsDialogOpen(true)}
            >
              <Tag size={15} />
              <span>{t("admin.batch.editGroupTags", "批量分组/标签")}</span>
            </Button>

            <Button
              size="2"
              variant="soft"
              onClick={() => setVersionDialogOpen(true)}
            >
              <ArrowUpCircle size={15} />
              <span>{t("admin.batch.switchVersion", "批量版本切换")}</span>
            </Button>

            <IconButton
              size="2"
              variant="ghost"
              color="gray"
              title={t("common.cancel", "取消选择")}
              onClick={onClearSelection}
            >
              <X size={16} />
            </IconButton>
          </Flex>
        </Flex>
      </div>

      <BatchCommandDialog
        open={commandDialogOpen}
        onOpenChange={setCommandDialogOpen}
        nodes={selectedNodes}
      />

      <BatchGroupTagsDialog
        open={groupTagsDialogOpen}
        onOpenChange={setGroupTagsDialogOpen}
        nodes={selectedNodes}
        onSuccess={() => {
          onRefresh();
          onClearSelection();
        }}
      />

      <BatchVersionDialog
        open={versionDialogOpen}
        onOpenChange={setVersionDialogOpen}
        nodes={selectedNodes}
        onSuccess={() => {
          onRefresh();
          onClearSelection();
        }}
      />
    </>
  );
};

/* =========================================================================
 * 1. 批量命令执行对话框
 * ========================================================================= */
interface BatchTaskResult {
  client: string;
  client_info?: { name?: string; uuid?: string };
  result: string;
  exit_code: number | null;
  finished_at: string | null;
}

const BatchCommandDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: NodeSchema[];
}> = ({ open, onOpenChange, nodes }) => {
  const { t } = useTranslation();
  const [command, setCommand] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState<BatchTaskResult[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/me")
        .then((res) => res.json())
        .then((data) => {
          const u = data?.data || data;
          setTwoFaEnabled(Boolean(u?.["2fa_enabled"]));
        })
        .catch(() => setTwoFaEnabled(false));
      setResults([]);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
  }, [open]);

  const handleExecute = async () => {
    if (!command.trim()) {
      toast.error(t("exec.errors.emptyCommand", "请输入要执行的命令"));
      return;
    }
    if (twoFaEnabled && !twoFaCode.trim()) {
      toast.error(t("account.otp_empty_error", "请输入动态口令"));
      return;
    }

    setExecuting(true);
    setResults([]);

    try {
      const res = await fetch("/api/admin/task/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          clients: nodes.map((n) => n.uuid),
          "2fa_code": twoFaCode.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const taskId = data?.task_id || data?.data?.task_id;
      if (!taskId) {
        throw new Error("Missing task ID in response");
      }

      toast.success(t("admin.batch.execDispatched", "批量任务已下发，正在接收执行结果..."));

      // 开始轮询结果
      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts++;
        try {
          const pollRes = await fetch(`/api/admin/task/${taskId}/result`);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            const list: BatchTaskResult[] = pollData.results || pollData.data || [];
            setResults(list);

            const allFinished =
              list.length >= nodes.length &&
              list.every((r) => r.finished_at !== null);

            if (allFinished || attempts >= 40) {
              if (pollingRef.current) clearInterval(pollingRef.current);
              setExecuting(false);
            }
          }
        } catch {
          // ignore transient poll error
        }
      }, 1500);
    } catch (err: unknown) {
      toast.error((err as Error).message || "下发失败");
      setExecuting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="max-w-3xl max-h-[85vh] flex flex-col">
        <Dialog.Title className="flex items-center gap-2">
          <Terminal size={18} />
          <span>{t("admin.batch.execTitle", "批量远程命令执行")}</span>
        </Dialog.Title>
        <Dialog.Description size="2" color="gray" className="mb-3">
          {t(
            "admin.batch.execDesc",
            `即将向选中的 {{count}} 台目标服务器批量下发指令`,
            { count: nodes.length }
          )}
        </Dialog.Description>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Target Nodes Pills */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
              {t("admin.batch.targetServers", "目标节点")}
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-md bg-accent-a1 border border-border/50">
              {nodes.map((n) => (
                <Badge key={n.uuid} size="1" color="gray" variant="surface">
                  {n.name || n.uuid.slice(0, 8)}
                </Badge>
              ))}
            </div>
          </div>

          {/* Command TextArea */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
              {t("admin.batch.command", "Shell 指令")}
            </label>
            <TextArea
              rows={4}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="uname -a && uptime"
              className="font-mono text-xs"
              disabled={executing}
            />
          </div>

          {twoFaEnabled && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                {t("account.2fa_otp_input_prompt", "动态口令")}
              </label>
              <TextField.Root
                className="w-40"
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value)}
                placeholder="2FA Code"
                disabled={executing}
              />
            </div>
          )}

          {/* Execution Results View */}
          {results.length > 0 && (
            <div className="space-y-2 mt-2">
              <label className="text-xs font-semibold text-muted-foreground block">
                {t("admin.batch.results", "实时执行回传")}
              </label>
              <div className="space-y-2">
                {results.map((r) => {
                  const isDone = r.finished_at !== null;
                  const isSuccess = isDone && r.exit_code === 0;
                  const clientName =
                    r.client_info?.name ||
                    nodes.find((n) => n.uuid === r.client)?.name ||
                    r.client;

                  return (
                    <div
                      key={r.client}
                      className="border rounded-md p-2.5 bg-accent-a1 text-xs space-y-1.5"
                    >
                      <Flex justify="between" align="center">
                        <Flex align="center" gap="2">
                          <Text weight="medium">{clientName}</Text>
                          {isDone ? (
                            <Badge
                              size="1"
                              color={isSuccess ? "green" : "red"}
                              variant="soft"
                            >
                              {isSuccess ? "成功 (0)" : `失败 (${r.exit_code ?? -1})`}
                            </Badge>
                          ) : (
                            <Badge size="1" color="blue" variant="surface">
                              <RefreshCw size={10} className="animate-spin mr-1 inline" />
                              执行中...
                            </Badge>
                          )}
                        </Flex>
                        {isDone && (
                          <IconButton
                            size="1"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(r.result || "");
                              toast.success(t("copy_success", "已复制到剪贴板"));
                            }}
                          >
                            <Copy size={12} />
                          </IconButton>
                        )}
                      </Flex>
                      <div className="bg-black/85 text-emerald-400 p-2 rounded font-mono text-[11px] whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {r.result || (isDone ? "[无输出内容]" : "正在等待 Agent 返回输出...")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <Flex justify="end" gap="2" className="mt-4 pt-2 border-t">
          <Button
            variant="soft"
            color="gray"
            disabled={executing}
            onClick={() => onOpenChange(false)}
          >
            {t("common.close", "关闭")}
          </Button>
          <Button onClick={handleExecute} disabled={executing}>
            {executing ? (
              <RefreshCw size={14} className="animate-spin mr-1" />
            ) : (
              <Play size={14} className="mr-1" />
            )}
            {executing ? t("admin.nodeEdit.waiting", "执行中...") : t("cron.runNow", "立即下发")}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

/* =========================================================================
 * 2. 批量修改分组/标签对话框
 * ========================================================================= */
const BatchGroupTagsDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: NodeSchema[];
  onSuccess: () => void;
}> = ({ open, onOpenChange, nodes, onSuccess }) => {
  const { t } = useTranslation();
  const [updateGroup, setUpdateGroup] = useState(false);
  const [newGroup, setNewGroup] = useState("");

  const [tagMode, setTagMode] = useState<"keep" | "replace" | "append">("keep");
  const [tagInput, setTagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleSubmit = async () => {
    if (!updateGroup && tagMode === "keep") {
      toast.warning(t("admin.batch.noChanges", "请至少勾选或选择一项需要更新的内容"));
      return;
    }

    setSubmitting(true);
    setProgress(0);
    let successCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const payload: Record<string, unknown> = {
        uuid: node.uuid,
      };

      if (updateGroup) {
        payload.group = newGroup.trim();
      }

      if (tagMode === "replace") {
        // Format tags with semicolon separator
        payload.tags = tagInput
          .split(/[,;\s]+/)
          .filter(Boolean)
          .join(";");
      } else if (tagMode === "append") {
        const existingTags = (node.tags || "")
          .split(/[,;\s]+/)
          .filter(Boolean);
        const newTags = tagInput
          .split(/[,;\s]+/)
          .filter(Boolean);
        const merged = Array.from(new Set([...existingTags, ...newTags]));
        payload.tags = merged.join(";");
      }

      try {
        const res = await fetch(`/api/admin/client/${node.uuid}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) successCount++;
      } catch {
        // continue with other nodes
      }
      setProgress(i + 1);
    }

    setSubmitting(false);
    toast.success(
      t("admin.batch.groupTagsSuccess", `已成功更新 {{count}} / {{total}} 台服务器`, {
        count: successCount,
        total: nodes.length,
      })
    );
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="max-w-md">
        <Dialog.Title className="flex items-center gap-2">
          <Tag size={18} />
          <span>{t("admin.batch.groupTagsTitle", "批量修改分组与标签")}</span>
        </Dialog.Title>
        <Dialog.Description size="2" color="gray" className="mb-4">
          {t(
            "admin.batch.groupTagsDesc",
            `统一调整已选中的 {{count}} 台服务器的分组和标签`,
            { count: nodes.length }
          )}
        </Dialog.Description>

        <div className="space-y-4">
          {/* Group Section */}
          <div className="p-3 rounded-lg border border-border/50 bg-accent-a1 space-y-2">
            <Flex align="center" gap="2">
              <Checkbox
                checked={updateGroup}
                onCheckedChange={(c) => setUpdateGroup(!!c)}
              />
              <label
                className="text-sm font-semibold cursor-pointer"
                onClick={() => setUpdateGroup(!updateGroup)}
              >
                {t("admin.batch.setGroup", "设置统一分组")}
              </label>
            </Flex>
            {updateGroup && (
              <TextField.Root
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder={t("admin.batch.groupPlaceholder", "例如: 生产节点 / 国内主机")}
                disabled={submitting}
              />
            )}
          </div>

          {/* Tags Section */}
          <div className="p-3 rounded-lg border border-border/50 bg-accent-a1 space-y-2">
            <label className="text-sm font-semibold block">
              {t("admin.batch.tagMode", "标签操作模式")}
            </label>
            <div className="flex gap-2">
              <Button
                size="1"
                variant={tagMode === "keep" ? "solid" : "soft"}
                color="gray"
                onClick={() => setTagMode("keep")}
              >
                保持不变
              </Button>
              <Button
                size="1"
                variant={tagMode === "append" ? "solid" : "soft"}
                onClick={() => setTagMode("append")}
              >
                追加标签
              </Button>
              <Button
                size="1"
                variant={tagMode === "replace" ? "solid" : "soft"}
                color="orange"
                onClick={() => setTagMode("replace")}
              >
                覆盖标签
              </Button>
            </div>

            {tagMode !== "keep" && (
              <TextField.Root
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="tag1, tag2, tag3"
                disabled={submitting}
                className="mt-2"
              />
            )}
          </div>

          {submitting && (
            <Flex align="center" gap="2" className="text-xs text-muted-foreground">
              <RefreshCw size={12} className="animate-spin" />
              <span>
                正在处理: {progress} / {nodes.length}
              </span>
            </Flex>
          )}
        </div>

        <Flex justify="end" gap="2" className="mt-6">
          <Button
            variant="soft"
            color="gray"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel", "取消")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? t("admin.nodeEdit.waiting", "保存中...") : t("common.save", "保存修改")}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

/* =========================================================================
 * 3. 批量版本升级/切换对话框
 * ========================================================================= */
const BatchVersionDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: NodeSchema[];
  onSuccess: () => void;
}> = ({ open, onOpenChange, nodes, onSuccess }) => {
  const { t } = useTranslation();
  const { call } = useRPC2Call();
  const [targetVersion, setTargetVersion] = useState("latest");
  const [submitting, setSubmitting] = useState(false);
  const [nodeResults, setNodeResults] = useState<
    Record<string, { status: "pending" | "success" | "error"; message?: string }>
  >({});

  const presetVersions = ["latest", "1.6.0", "1.5.0"];

  const handleSwitch = async () => {
    if (!targetVersion.trim()) {
      toast.error(t("admin.batch.emptyVersion", "请输入目标版本号"));
      return;
    }

    setSubmitting(true);
    const results: Record<string, { status: "pending" | "success" | "error"; message?: string }> = {};
    nodes.forEach((n) => {
      results[n.uuid] = { status: "pending" };
    });
    setNodeResults({ ...results });

    let successCount = 0;
    for (const node of nodes) {
      try {
        await call("admin:switchAgentVersion", {
          uuid: node.uuid,
          version: targetVersion.trim(),
        });
        results[node.uuid] = { status: "success", message: "指令已下发" };
        successCount++;
      } catch (err: unknown) {
        results[node.uuid] = {
          status: "error",
          message: (err as Error).message || "下发失败/离线",
        };
      }
      setNodeResults({ ...results });
    }

    setSubmitting(false);
    toast.success(
      t("admin.batch.switchSuccess", `已向 {{count}} / {{total}} 台服务器下发版本切换指令`, {
        count: successCount,
        total: nodes.length,
      })
    );
    onSuccess();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="max-w-md">
        <Dialog.Title className="flex items-center gap-2">
          <ArrowUpCircle size={18} />
          <span>{t("admin.batch.versionTitle", "批量版本升级 / 切换")}</span>
        </Dialog.Title>
        <Dialog.Description size="2" color="gray" className="mb-4">
          {t(
            "admin.batch.versionDesc",
            `为选中的 {{count}} 台服务器下发版本切换指令（仅对在线 v2 Agent 有效）`,
            { count: nodes.length }
          )}
        </Dialog.Description>

        <div className="space-y-4">
          {/* Target Version Input & Presets */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
              {t("admin.batch.selectTargetVersion", "目标版本")}
            </label>
            <div className="flex gap-2 mb-2">
              {presetVersions.map((v) => (
                <Button
                  key={v}
                  size="1"
                  variant={targetVersion === v ? "solid" : "soft"}
                  onClick={() => setTargetVersion(v)}
                >
                  {v === "latest" ? "latest (最新版)" : v}
                </Button>
              ))}
            </div>
            <TextField.Root
              value={targetVersion}
              onChange={(e) => setTargetVersion(e.target.value)}
              placeholder="latest / 1.6.0"
              disabled={submitting}
            />
          </div>

          {/* Node Dispatch Status */}
          {Object.keys(nodeResults).length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1.5 border rounded-md p-2 bg-accent-a1 text-xs">
              {nodes.map((n) => {
                const res = nodeResults[n.uuid];
                return (
                  <Flex key={n.uuid} justify="between" align="center">
                    <span className="truncate max-w-[200px]">{n.name}</span>
                    {res?.status === "success" ? (
                      <Badge size="1" color="green" variant="soft">
                        <CheckCircle2 size={10} className="mr-1 inline" />
                        已下发
                      </Badge>
                    ) : res?.status === "error" ? (
                      <Badge size="1" color="red" variant="soft">
                        <AlertCircle size={10} className="mr-1 inline" />
                        {res.message || "失败"}
                      </Badge>
                    ) : (
                      <Badge size="1" color="blue" variant="surface">
                        <RefreshCw size={10} className="animate-spin mr-1 inline" />
                        下发中...
                      </Badge>
                    )}
                  </Flex>
                );
              })}
            </div>
          )}
        </div>

        <Flex justify="end" gap="2" className="mt-6">
          <Button
            variant="soft"
            color="gray"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel", "取消")}
          </Button>
          <Button onClick={handleSwitch} disabled={submitting}>
            {submitting ? (
              <RefreshCw size={14} className="animate-spin mr-1" />
            ) : (
              <ArrowUpCircle size={14} className="mr-1" />
            )}
            {submitting ? t("admin.nodeEdit.waiting", "下发中...") : t("admin.batch.dispatch", "立即下发切换")}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, Flex, IconButton, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export interface DashboardCronTask {
  id: string;
  name: string;
  command: string;
  schedule_type: "preset" | "interval" | "cron";
  interval_minutes: number;
  cron_expression?: string;
  target_nodes: string[];
  enabled: boolean;
  notify_on_failure?: boolean;
  last_run_at: string | null;
  last_exit_code: number | null;
  last_result: string | null;
  next_run_at: string | null;
}

export const CronDashboardWidget: React.FC<{ limit?: number }> = ({ limit = 4 }) => {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<DashboardCronTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cron");
      if (res.ok) {
        const json = await res.json();
        const taskList: DashboardCronTask[] = json?.tasks || json?.data || [];
        setTasks(taskList);
      }
    } catch {
      // Fallback or silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleRunNow = async (task: DashboardCronTask, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setRunningTaskId(task.id);
    try {
      const res = await fetch(`/api/admin/cron/${task.id}/run`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success(t("cron.runSuccess", "定时任务已触发下发"));
        fetchTasks();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || t("cron.runFailed", "触发失败"));
      }
    } catch {
      toast.error(t("cron.runFailed", "触发失败"));
    } finally {
      setRunningTaskId(null);
    }
  };

  const enabledCount = tasks.filter((t) => t.enabled).length;
  const displayedTasks = tasks.slice(0, limit);

  return (
    <Flex direction="column" gap="3" style={{ height: "100%", minHeight: 0 }}>
      {/* Widget Header */}
      <Flex justify="between" align="center" className="flex-shrink-0">
        <Flex align="center" gap="2">
          <CalendarClock size={16} className="text-primary" />
          <Text size="2" weight="bold">
            {t("dashboardLayout.widgets.cron", "定时任务")}
          </Text>
          <Badge size="1" color={enabledCount > 0 ? "grass" : "gray"}>
            {enabledCount} / {tasks.length}
          </Badge>
        </Flex>
        <Link to="/admin/cron" className="no-underline">
          <Flex align="center" gap="1" className="text-xs text-muted-foreground hover:text-foreground">
            <span>{t("common.more", "管理")}</span>
            <ArrowRight size={12} />
          </Flex>
        </Link>
      </Flex>

      {/* Widget Body */}
      {loading ? (
        <Flex align="center" justify="center" style={{ flex: 1 }}>
          <RefreshCw size={18} className="animate-spin text-muted-foreground" />
        </Flex>
      ) : tasks.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="2"
          style={{ flex: 1, minHeight: 100 }}
          className="text-muted-foreground"
        >
          <Clock size={24} className="opacity-40" />
          <Text size="1">{t("cron.noTasks", "暂无定时任务")}</Text>
          <Link to="/admin/cron">
            <Button size="1" variant="soft">
              {t("cron.createTask", "新建任务")}
            </Button>
          </Link>
        </Flex>
      ) : (
        <Flex direction="column" gap="2" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {displayedTasks.map((task) => {
            const hasRun = task.last_run_at !== null;
            const isSuccess = hasRun && task.last_exit_code === 0;
            const isFailed = hasRun && task.last_exit_code !== 0 && task.last_exit_code !== null;

            return (
              <Flex
                key={task.id}
                justify="between"
                align="center"
                gap="2"
                className="p-2 rounded-md bg-accent-a1 border border-border/40 hover:bg-accent-a2 transition-colors"
              >
                <Flex align="center" gap="2" style={{ minWidth: 0, flex: 1 }}>
                  {isSuccess ? (
                    <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                  ) : isFailed ? (
                    <AlertCircle size={15} className="text-rose-500 shrink-0" />
                  ) : (
                    <Clock size={15} className="text-muted-foreground shrink-0" />
                  )}

                  <Flex direction="column" style={{ minWidth: 0, flex: 1 }}>
                    <Flex align="center" gap="1">
                      <Text size="2" weight="medium" className="truncate">
                        {task.name}
                      </Text>
                      {!task.enabled && (
                        <Badge size="1" color="gray" variant="surface">
                          {t("common.disabled", "停用")}
                        </Badge>
                      )}
                    </Flex>
                    <Text size="1" color="gray" className="truncate text-xs">
                      {task.schedule_type === "cron"
                        ? task.cron_expression || "Cron"
                        : `${task.interval_minutes}m`}
                      {task.last_run_at
                        ? ` · 上次: ${new Date(task.last_run_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : " · 待执行"}
                    </Text>
                  </Flex>
                </Flex>

                <IconButton
                  size="1"
                  variant="ghost"
                  disabled={runningTaskId === task.id}
                  onClick={(e) => handleRunNow(task, e)}
                  title={t("cron.runNow", "立即执行")}
                >
                  <Play size={13} className={runningTaskId === task.id ? "animate-pulse" : ""} />
                </IconButton>
              </Flex>
            );
          })}
        </Flex>
      )}
    </Flex>
  );
};

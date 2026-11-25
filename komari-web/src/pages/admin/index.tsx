import { useEffect, useMemo, useState } from "react";
import { NodeDetailsProvider } from "@/contexts/NodeDetailsContext";
import { useLiveDataMeta } from "@/contexts/LiveDataContext";
import { isNodeOnline } from "@/utils/nodeOnline";
import { Swap } from "@/components/motion";
import { Skeletonize } from "@/components/ui/skeleton";
import { PLACEHOLDER_NODES } from "./servers/placeholderNodes";
import useServerList from "./servers/useServerList";
import EmptyNodesGuide from "./servers/EmptyNodesGuide";
import Header from "./servers/Header";
import NodeTable from "./servers/NodeTable";
import { BatchOperationsBar } from "./servers/BatchOperations";

const NodeDetailsPage = () => {
  return (
    <NodeDetailsProvider>
      <Layout />
    </NodeDetailsProvider>
  );
};

const Layout = () => {
  const { nodeDetail, error, settings, settingsLoading, pending, isEmpty, refresh } =
    useServerList();
  const { online, hasLiveData } = useLiveDataMeta();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);

  useEffect(() => {
    if (pending || !Array.isArray(nodeDetail)) return;
    const validIds = new Set(nodeDetail.map((n) => n.uuid));
    setSelectedNodes((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [nodeDetail, pending]);

  const sortedAllNodes = useMemo(
    () =>
      Array.isArray(nodeDetail)
        ? [...nodeDetail].sort((a, b) => {
            if (a.weight !== b.weight) {
              return a.weight - b.weight;
            }
            const timeA = new Date(a.created_at || 0).getTime();
            const timeB = new Date(b.created_at || 0).getTime();
            if (timeA !== timeB) {
              return timeA - timeB;
            }
            return (a.name || "").localeCompare(b.name || "");
          })
        : [],
    [nodeDetail],
  );

  const statusCounts = useMemo(() => {
    let onlineCount = 0;
    for (const node of sortedAllNodes) {
      if (isNodeOnline(node.uuid, online, hasLiveData, (node as any)?.online)) {
        onlineCount++;
      }
    }
    return {
      all: sortedAllNodes.length,
      online: onlineCount,
      offline: sortedAllNodes.length - onlineCount,
    };
  }, [sortedAllNodes, online, hasLiveData]);

  const filteredNodes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return sortedAllNodes.filter((node) => {
      if (statusFilter !== "all") {
        const nodeOnline = isNodeOnline(
          node.uuid,
          online,
          hasLiveData,
          (node as any)?.online,
        );
        if (statusFilter === "online" && !nodeOnline) return false;
        if (statusFilter === "offline" && nodeOnline) return false;
      }
      if (!query) return true;
      return [
        node.name,
        node.ipv4,
        node.ipv6,
        node.group,
        node.tags,
        node.remark,
        node.public_remark,
        node.version,
      ].some((field) => field?.toLowerCase().includes(query));
    });
  }, [sortedAllNodes, searchTerm, statusFilter, online, hasLiveData]);

  const isFiltered = Boolean(searchTerm.trim()) || statusFilter !== "all";

  if (error) return <div>{error}</div>;

  return (
    <div className="km-page km-page-admin-index">
      <Header
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        statusCounts={statusCounts}
        selectedNodes={selectedNodes}
        settings={settings}
        settingsLoading={settingsLoading}
      />

      {/*
        surface 层：空状态 <-> 列表交叉淡化，外层高度弹簧（Swap = AutoHeight + popLayout），
        搜索过滤导致的行增删也由同一个 AutoHeight 跟随，表格下方不会跳。
        加载中：用占位行渲染真实表格并骨架化（形状就是表格本身），到达后同一位置淡成内容。
      */}
      <Swap swapKey={isEmpty ? "empty" : "table"}>
        {isEmpty ? (
          <EmptyNodesGuide />
        ) : (
          <Skeletonize loading={pending} className="km-setting-card-skeleton">
            <NodeTable
              // 占位行与真实行 uuid 不同：换一棵子树，让 localNodes 直接从真实数据初始化
              key={pending ? "placeholder" : "data"}
              nodes={pending ? PLACEHOLDER_NODES : filteredNodes}
              isFiltered={pending ? false : isFiltered}
              selectedNodes={pending ? [] : selectedNodes}
              setSelectedNodes={setSelectedNodes}
              settings={settings}
            />
          </Skeletonize>
        )}
      </Swap>
      <BatchOperationsBar
        selectedNodes={
          Array.isArray(nodeDetail)
            ? nodeDetail.filter((n) => selectedNodes.includes(n.uuid))
            : []
        }
        onClearSelection={() => setSelectedNodes([])}
        onRefresh={refresh}
      />
    </div>
  );
};

export default NodeDetailsPage;

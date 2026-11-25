/**
 * 统一计算节点实时在线状态。
 *
 * `live_data` 已就绪时以 WebSocket 2 秒推送的 `online` 列表为准，
 * 避免 `/api/admin/client/list` 5 秒轮询快照在节点离线后拖住状态；
 * 仅当 `live_data` 尚未到达时回退到节点快照字段。
 */
export function isNodeOnline(
  uuid: string | undefined | null,
  onlineUuids: readonly string[] | null | undefined,
  hasLiveData: boolean,
  fallbackOnline?: unknown
): boolean {
  if (hasLiveData && Array.isArray(onlineUuids)) {
    if (!uuid || onlineUuids.length === 0) return false;
    const normalized = uuid.toLowerCase();
    return onlineUuids.some(
      (id) => id === uuid || id?.toLowerCase() === normalized
    );
  }
  return Boolean(fallbackOnline);
}

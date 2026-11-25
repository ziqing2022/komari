import { lazy, Suspense, useState } from "react";
import type { NodeDetail } from "@/contexts/NodeDetailsContext";
import { useLiveDataMeta } from "@/contexts/LiveDataContext";
import { isNodeOnline } from "@/utils/nodeOnline";
import { useTranslation } from "react-i18next";
import { Badge } from "@radix-ui/themes";
import Flag from "@/components/Flag";

const loadDetailDrawer = () => import("./DetailDrawer");
const DetailDrawer = lazy(loadDetailDrawer);

export default function DetailView({ node }: { node: NodeDetail }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();
  const { online, hasLiveData } = useLiveDataMeta();
  const isOnline = isNodeOnline(
    node.uuid,
    online,
    hasLiveData,
    (node as any)?.online
  );

  return (
    <>
      <div
        className="h-8 flex items-center gap-2 hover:underline cursor-pointer font-bold text-base select-none"
        onPointerEnter={() => void loadDetailDrawer()}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all ${
            isOnline
              ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"
              : "bg-red-500/80"
          }`}
          title={isOnline ? t("nodeCard.online", "在线") : t("nodeCard.offline", "离线")}
        />
        <Flag flag={node.region} size="6" />
        <span>{node.name.length > 25 ? node.name.slice(0, 25) + "..." : node.name}</span>
        <Badge
          color={isOnline ? "green" : "red"}
          variant="soft"
          size="1"
          className="font-normal ml-1"
        >
          {isOnline ? t("nodeCard.online", "在线") : t("nodeCard.offline", "离线")}
        </Badge>
      </div>
      {mounted && (
        <Suspense fallback={null}>
          <DetailDrawer node={node} open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}

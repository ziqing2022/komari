import { useState, useRef, useEffect } from "react";
import { Button, Dialog, Flex, Text, TextField } from "@radix-ui/themes";
import { AlertCircle, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getOSImage } from "@/utils/osImageHelper";

interface Workbench2FaDialogProps {
  open: boolean;
  client: { uuid: string; name?: string; os?: string } | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function Workbench2FaDialog({
  open,
  client,
  onOpenChange,
  onSuccess,
}: Workbench2FaDialogProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
      setLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  const handleVerify = async () => {
    const cleanCode = code.replace(/[\s-]/g, "").trim();
    if (!cleanCode) {
      setError(t("account.otp_empty_error", "请输入 6 位动态口令"));
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/2fa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-2FA-Code": cleanCode,
        },
        body: JSON.stringify({
          code: cleanCode,
          "2fa_code": cleanCode,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || t("terminal.otp_invalid", "2FA 验证码无效或已过期，请重试"),
        );
      }

      onSuccess();
    } catch (err: any) {
      setError(
        err.message || t("terminal.otp_invalid", "2FA 验证码无效或已过期，请重试"),
      );
      setCode("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleVerify();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        maxWidth="440px"
        className="!bg-[#1c1c1f] !border !border-neutral-800 !text-neutral-200 shadow-2xl backdrop-blur-md rounded-xl"
        onEscapeKeyDown={() => onOpenChange(false)}
        onPointerDownOutside={() => onOpenChange(false)}
      >
        <Flex align="center" gap="2.5" mb="1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck size={20} />
          </div>
          <div>
            <Dialog.Title className="!text-base !font-semibold !text-white !m-0">
              {t("terminal.workbench_2fa_title", "工作台二次验证")}
            </Dialog.Title>
            <Text size="1" color="gray">
              {t("terminal.2fa_prompt", "需要双因素认证")}
            </Text>
          </div>
        </Flex>

        <Dialog.Description size="2" className="mt-3 text-neutral-400 leading-relaxed">
          {t(
            "terminal.workbench_2fa_prompt",
            "已开启双重身份验证 (2FA)。为了保障目标服务器与工作台的安全性，请输入身份验证器生成的 6 位动态口令后进入。",
          )}
        </Dialog.Description>

        {client && (
          <div className="mt-3.5 flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-[#252528] px-3 py-2 text-xs text-neutral-300">
            {client.os && (
              <img
                src={getOSImage(client.os)}
                alt=""
                className="h-4 w-4 shrink-0 object-contain"
                draggable={false}
              />
            )}
            <span className="font-medium text-white truncate max-w-[200px]">
              {client.name || client.uuid}
            </span>
            <span className="font-mono text-[11px] text-neutral-500 truncate ml-auto">
              {client.uuid}
            </span>
          </div>
        )}

        <div className="mt-4 space-y-2">
          <label htmlFor="workbench_2fa_input" className="block text-xs font-medium text-neutral-300">
            {t("terminal.2fa_code_prompt", "请输入 2FA 验证码: ")}
          </label>
          <div className="relative">
            <TextField.Root
              ref={inputRef}
              id="workbench_2fa_input"
              type="text"
              inputMode="numeric"
              maxLength={8}
              autoComplete="one-time-code"
              placeholder="例如 123456"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={handleKeyDown}
              disabled={loading}
              className="!bg-[#141416] !border-neutral-700 !text-white text-base tracking-widest font-mono"
            >
              <TextField.Slot>
                <KeyRound size={15} className="text-neutral-400" />
              </TextField.Slot>
            </TextField.Root>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 rounded-md border border-red-900/60 bg-red-950/40 px-2.5 py-1.5 text-xs text-red-400 animate-in fade-in duration-200">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <Flex gap="2.5" justify="end" className="mt-6">
          <Button
            variant="soft"
            color="gray"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t("common.cancel", "取消")}
          </Button>
          <Button
            color="green"
            onClick={() => void handleVerify()}
            disabled={loading || !code.trim()}
            className="!bg-emerald-600 hover:!bg-emerald-500 !text-white font-medium shadow-sm transition-colors"
          >
            {loading ? (
              <>
                <LoaderCircle size={15} className="animate-spin mr-1" />
                {t("common.verifying", "验证中...")}
              </>
            ) : (
              t("terminal.workbench_2fa_submit", "验证并进入工作台")
            )}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

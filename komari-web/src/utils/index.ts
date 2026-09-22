/**
 * Utils module exports
 * 统一导出所有工具函数
 */

export * from './iconHelper';
export * from './osImageHelper';
export * from './regionHelper';
export * from './UserAgentHelper';
export * from './RecordHelper';
export * from './themeConfiguration';
export * from './i18nText';
export * from './unitHelper';
export * from './field';
export * from './eula';
export * from './language';
export * from './shellQuote';

export const formatLoginRedirect = (target: string | null) => {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) {
    return null;
  }
  try {
    const url = new URL(target, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      url.pathname.split("/").includes("..")
    ) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

export const resolveLoginRedirect = (value: string | null) => {
  return formatLoginRedirect(value) ?? "/admin/dashboard";
};

export const loginPath = (pathname: string, search = "") => {
  const normalizedSearch =
    search && search !== "?" ? `?${search.replace(/^\?/, "")}` : "";
  const redirect = formatLoginRedirect(`${pathname}${normalizedSearch}`);
  return redirect
    ? `/admin/login?redirect=${encodeURIComponent(redirect)}`
    : "/admin/login";
};

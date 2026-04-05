"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Activity,
  AppWindow,
  Banknote,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Code,
  FileSignature,
  FolderKanban,
  Footprints,
  Gavel,
  GitBranch,
  GitPullRequest,
  Handshake,
  HardDrive,
  Headphones,
  Headset,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Monitor,
  Scale,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SidebarBadgeKey, SidebarChild, SidebarGroup, SidebarItem } from "@/lib/sidebar-config";
import { SIDEBAR_GROUPS } from "@/lib/sidebar-config";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import type { Module, SystemRole } from "@nexusops/types";

const STORAGE_KEY = "nexusops_sidebar_state";

const ALERT_BADGES: SidebarBadgeKey[] = [
  "incidents_open",
  "security_incidents_open",
  "approvals_pending",
];

const SIDEBAR_ICONS: Record<string, LucideIcon> = {
  Monitor,
  Headset,
  GitBranch,
  Wrench,
  Activity,
  HardDrive,
  ShieldCheck,
  Shield,
  Scale,
  CheckSquare,
  Users,
  UserCheck,
  Building2,
  Footprints,
  Handshake,
  Headphones,
  TrendingUp,
  LayoutGrid,
  LayoutDashboard,
  ClipboardList,
  Banknote,
  ShoppingCart,
  FileSignature,
  Briefcase,
  Gavel,
  Target,
  FolderKanban,
  AppWindow,
  BarChart3,
  Code,
  GitPullRequest,
  BookOpen,
  Settings,
  SlidersHorizontal,
};

function IconByName({ name, className }: { name: string; className?: string }) {
  const Cmp = SIDEBAR_ICONS[name];
  if (!Cmp) return null;
  return <Cmp className={className} />;
}

function routeBase(href: string) {
  const q = href.indexOf("?");
  return q >= 0 ? href.slice(0, q) : href;
}

function pathActive(pathname: string, href: string) {
  const base = routeBase(href);
  return pathname === base || pathname.startsWith(`${base}/`);
}

function childHrefActive(pathname: string, searchString: string, href: string): boolean {
  const q = href.indexOf("?");
  if (q < 0) return pathActive(pathname, href);
  const base = href.slice(0, q);
  const childSearch = href.slice(q);
  return pathname === base && searchString === childSearch;
}

function itemOrChildActive(pathname: string, item: SidebarItem): boolean {
  if (pathActive(pathname, item.href)) return true;
  if (!item.children) return false;
  return item.children.some((c) => pathActive(pathname, c.href));
}

function findActiveGroupId(pathname: string, groups: SidebarGroup[]): string | null {
  for (const g of groups) {
    for (const item of g.items) {
      if (itemOrChildActive(pathname, item)) return g.id;
    }
  }
  return null;
}

function defaultExpandedSet(): Set<string> {
  return new Set(SIDEBAR_GROUPS.filter((g) => g.defaultExpanded).map((g) => g.id));
}

function filterGroupsBySearch(groups: SidebarGroup[], q: string): SidebarGroup[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return groups;

  return groups
    .map((g) => {
      const items: SidebarItem[] = [];
      for (const item of g.items) {
        const labelHit = item.label.toLowerCase().includes(ql);
        if (!item.children?.length) {
          if (labelHit) items.push(item);
          continue;
        }
        const childHits = item.children.filter((c) => c.label.toLowerCase().includes(ql));
        if (labelHit) {
          items.push(item);
        } else if (childHits.length) {
          items.push({ ...item, children: childHits });
        }
      }
      return { ...g, items };
    })
    .filter((g) => g.items.length > 0);
}

function filterItemsByRole(
  groups: SidebarGroup[],
  hasRole: (r: SystemRole) => boolean,
  canAccess: (m: Module) => boolean,
): SidebarGroup[] {
  return groups
    .map((g) => {
      // Hide the entire group when the user cannot access any of its declared modules
      if (g.modules?.length && !g.modules.some(canAccess)) return null;
      const items = g.items.filter((item) => {
        if (item.requiresRole && !hasRole(item.requiresRole)) return false;
        if (item.module && !canAccess(item.module)) return false;
        return true;
      });
      return items.length ? { ...g, items } : null;
    })
    .filter((g): g is SidebarGroup => g !== null);
}

function useSidebarBadges(): Partial<Record<SidebarBadgeKey, number>> {
  const { can, isAuthenticated } = useRBAC();
  const canMetrics = isAuthenticated && can("reports", "read");
  const canSecurity = isAuthenticated && can("security", "read");

  const metricsQ = trpc.dashboard.getMetrics.useQuery(undefined, {
    enabled: canMetrics,
    refetchInterval: 60_000,
    retry: false,
  });

  const securityQ = trpc.security.openIncidentCount.useQuery(undefined, {
    enabled: canSecurity,
    refetchInterval: 60_000,
    retry: false,
  });

  return useMemo(() => {
    const out: Partial<Record<SidebarBadgeKey, number>> = {};
    if (metricsQ.isSuccess && metricsQ.data) {
      out.incidents_open = metricsQ.data.openTickets;
      out.approvals_pending = metricsQ.data.pendingApprovals;
    }
    if (securityQ.isSuccess && securityQ.data !== undefined) {
      out.security_incidents_open = securityQ.data;
    }
    return out;
  }, [metricsQ.isSuccess, metricsQ.data, securityQ.isSuccess, securityQ.data]);
}

function BadgePill({
  value,
  variant,
}: {
  value: number;
  variant: "alert" | "muted";
}) {
  if (variant === "alert" && value === 0) return null;
  const cls =
    variant === "alert"
      ? "bg-destructive/10 text-destructive"
      : "bg-muted text-muted-foreground";
  return (
    <span
      className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums leading-none ${cls}`}
    >
      {value}
    </span>
  );
}

type SidebarNavContentProps = {
  search: string;
  setSearch: (v: string) => void;
  filteredGroups: SidebarGroup[];
  expandedGroups: Set<string>;
  toggleGroup: (id: string) => void;
  expandedItems: Set<string>;
  toggleItem: (key: string) => void;
  pathname: string;
  currentSearch: string;
  badgeMap: Partial<Record<SidebarBadgeKey, number>>;
  searchActive: boolean;
  onNavigate: () => void;
};

function SidebarNavContent({
  search,
  setSearch,
  filteredGroups,
  expandedGroups,
  toggleGroup,
  expandedItems,
  toggleItem,
  pathname,
  currentSearch,
  badgeMap,
  searchActive,
  onNavigate,
}: SidebarNavContentProps) {
  return (
    <>
      <div className="px-3 py-2 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/70 dark:bg-muted/40 rounded">
          <Search className="w-3 h-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Filter navigator..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-[12px] text-sidebar-foreground placeholder:text-muted-foreground outline-none flex-1 min-w-0"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-1 min-h-0">
        {filteredGroups.map((group) => {
          const GroupIcon = SIDEBAR_ICONS[group.icon];
          const visibleCount = group.items.length;
          const isOpen = searchActive || expandedGroups.has(group.id);

          return (
            <div key={group.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-all duration-150 ease-out hover:bg-muted/30 cursor-pointer"
              >
                {GroupIcon ? (
                  <GroupIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : null}
                <span className="flex-1 truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {visibleCount}
                </span>
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>

              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="space-y-0.5 pb-1">
                    {group.items.map((item) => {
                      const itemKey = `${group.id}:${item.label}`;
                      const hasChildren = Boolean(item.children?.length);
                      const itemActive = itemOrChildActive(pathname, item);
                      const nestedOpen = hasChildren && (searchActive || expandedItems.has(itemKey));

                      const badgeKey = item.badge;
                      const rawCount = badgeKey !== undefined ? badgeMap[badgeKey] : undefined;
                      const isAlertBadge = badgeKey !== undefined && ALERT_BADGES.includes(badgeKey);

                      return (
                        <div key={itemKey}>
                          <div
                            className={`flex items-center gap-0 pr-2 ${
                              itemActive
                                ? "border-l-2 border-primary bg-accent/10 font-medium text-accent-foreground"
                                : "border-l-2 border-transparent"
                            }`}
                          >
                            <Link
                              href={item.href}
                              onClick={onNavigate}
                              className={`flex min-w-0 flex-1 items-center py-1.5 pl-8 pr-1 text-sm font-normal transition-colors hover:bg-muted/50 rounded-sm ${
                                itemActive ? "" : "text-sidebar-foreground/90"
                              }`}
                            >
                              <IconByName
                                name={item.icon}
                                className={`mr-2 h-4 w-4 shrink-0 ${
                                  itemActive ? "text-accent-foreground" : "text-muted-foreground"
                                }`}
                              />
                              <span className="truncate">{item.label}</span>
                              {badgeKey !== undefined && rawCount !== undefined && (
                                <BadgePill
                                  value={rawCount}
                                  variant={isAlertBadge ? "alert" : "muted"}
                                />
                              )}
                            </Link>
                            {hasChildren ? (
                              <button
                                type="button"
                                aria-label={nestedOpen ? "Collapse" : "Expand"}
                                onClick={() => toggleItem(itemKey)}
                                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/50"
                              >
                                {nestedOpen ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : null}
                          </div>

                          {hasChildren ? (
                            <div
                              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                                nestedOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="space-y-0.5 pb-0.5">
                                  {item.children!.map((child: SidebarChild) => {
                                    const childActive = childHrefActive(pathname, currentSearch, child.href);
                                    return (
                                      <Link
                                        key={child.href + child.label}
                                        href={child.href}
                                        onClick={onNavigate}
                                        className={`flex items-center py-1.5 pl-12 pr-3 text-xs transition-colors hover:bg-muted/50 ${
                                          childActive
                                            ? "border-l-2 border-primary bg-accent/10 font-medium text-accent-foreground"
                                            : "border-l-2 border-transparent text-sidebar-foreground/85"
                                        }`}
                                      >
                                        <span className="mr-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                                        <span className="truncate">{child.label}</span>
                                      </Link>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-2 text-[10px] text-muted-foreground flex items-center justify-between shrink-0">
        <span>NexusOps Platform {process.env.NEXT_PUBLIC_APP_VERSION ?? "v2.0.1"}</span>
        <span className="text-green-600 dark:text-green-400">● Online</span>
      </div>
    </>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const { hasRole, canAccess } = useRBAC();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(defaultExpandedSet);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [persistReady, setPersistReady] = useState(false);

  const badgeMap = useSidebarBadges();

  const roleFiltered = useMemo(
    () => filterItemsByRole(SIDEBAR_GROUPS, hasRole, canAccess),
    [hasRole, canAccess],
  );

  const filteredGroups = useMemo(
    () => filterGroupsBySearch(roleFiltered, search),
    [roleFiltered, search],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        setExpandedGroups(new Set(ids));
      }
    } catch {
      /* keep default */
    }
    setPersistReady(true);
  }, []);

  useEffect(() => {
    if (!persistReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...expandedGroups]));
    } catch {
      /* ignore */
    }
  }, [expandedGroups, persistReady]);

  useEffect(() => {
    const gid = findActiveGroupId(pathname, roleFiltered);
    if (gid) {
      setExpandedGroups((prev) => new Set([...prev, gid]));
    }
  }, [pathname, roleFiltered]);

  useEffect(() => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      for (const g of roleFiltered) {
        for (const item of g.items) {
          if (!item.children?.length) continue;
          const key = `${g.id}:${item.label}`;
          if (itemOrChildActive(pathname, item)) next.add(key);
        }
      }
      return next;
    });
  }, [pathname, roleFiltered]);

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const toggleItem = useCallback((key: string) => {
    setExpandedItems((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  const searchActive = search.trim() !== "";

  const navProps: SidebarNavContentProps = {
    search,
    setSearch,
    filteredGroups,
    expandedGroups,
    toggleGroup,
    expandedItems,
    toggleItem,
    pathname,
    currentSearch,
    badgeMap,
    searchActive,
    onNavigate: () => setMobileOpen(false),
  };

  const shellClass =
    "flex h-full min-h-0 w-56 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground";

  return (
    <>
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-4 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <aside className={`hidden md:flex ${shellClass}`}>
          <SidebarNavContent {...navProps} onNavigate={() => {}} />
        </aside>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className={`fixed left-0 top-11 z-50 flex md:hidden ${shellClass} h-[calc(100dvh-2.75rem)] shadow-lg outline-none`}
          >
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <div className="flex items-center justify-end border-b border-sidebar-border px-2 py-1 shrink-0">
              <DialogPrimitive.Close
                className="rounded p-1.5 text-muted-foreground hover:bg-muted/50"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SidebarNavContent {...navProps} />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

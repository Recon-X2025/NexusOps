import { NavLink } from '../lib/router';
import {
  LayoutDashboard, Building2, Users, Server, ShieldCheck, Activity,
  ScrollText, Settings, ChevronLeft, ChevronRight,
  Rocket, Wallet, Lock, AlertTriangle, Sliders, UserCog, UserCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'Platform',
    items: [
      { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    ],
  },
  {
    title: 'Tenant Management',
    items: [
      { to: '/tenants', label: 'Organizations', icon: <Building2 className="h-4 w-4" /> },
      { to: '/setup-wizard-monitor', label: 'Onboarding Monitor', icon: <Rocket className="h-4 w-4" /> },
      { to: '/users/global', label: 'Global Users', icon: <Users className="h-4 w-4" /> },
    ],
  },
  {
    title: 'Security & Compliance',
    items: [
      { to: '/compliance-grc', label: 'Compliance Oversight', icon: <ShieldCheck className="h-4 w-4" /> },
      { to: '/compliance/dpdp', label: 'DPDP & Data Protection', icon: <Lock className="h-4 w-4" /> },
      { to: '/compliance/grc-risks', label: 'Risk & GRC', icon: <AlertTriangle className="h-4 w-4" /> },
    ],
  },
  {
    title: 'SaaS',
    items: [
      { to: '/billing', label: 'Subscriptions & Billing', icon: <Wallet className="h-4 w-4" /> },
    ],
  },
  {
    title: 'Platform Operations',
    items: [
      { to: '/users-roles', label: 'Operators & Roles', icon: <UserCog className="h-4 w-4" /> },
      { to: '/feature-flags', label: 'Feature Flags', icon: <Sliders className="h-4 w-4" /> },
      { to: '/system-health', label: 'System Health', icon: <Activity className="h-4 w-4" /> },
    ],
  },
  {
    title: 'Audit & Support',
    items: [
      { to: '/audit-log', label: 'Audit Log', icon: <ScrollText className="h-4 w-4" /> },
      { to: '/impersonations', label: 'Impersonation Sessions', icon: <UserCheck className="h-4 w-4" /> },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

export function Sidebar({
  collapsed, onToggle, mobileOpen, onCloseMobile,
}: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onCloseMobile: () => void }) {
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm md:hidden" onClick={onCloseMobile} />
      )}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200 dark:border-slate-700 dark:bg-slate-900 ${
          collapsed ? 'w-16' : 'w-60'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-3 dark:border-slate-700">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue text-white">
              <Server className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <p className="truncate font-heading text-sm font-bold text-slate-900 dark:text-white">CoheronConnect</p>
                <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">Super-Admin Console</p>
              </div>
            )}
          </div>
          <button
            onClick={onToggle}
            className="hidden rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 md:block"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
          {GROUPS.map((group) => (
            <div key={group.title} className="mb-4">
              {!collapsed && (
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onCloseMobile}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-200 ${
                        isActive
                          ? 'bg-brand-blue/10 font-medium text-brand-blue dark:bg-brand-blue/15 dark:text-blue-400'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      } ${collapsed ? 'justify-center' : ''}`
                    }
                  >
                    {item.icon}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {!collapsed && (
          <div className="border-t border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-800">
              <LayoutDashboard className="h-4 w-4 text-brand-gray" />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Platform build v2.4.0</p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

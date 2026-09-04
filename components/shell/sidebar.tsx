'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Boxes,
  Truck,
  ClipboardList,
  Receipt,
  FileText,
  CreditCard,
  BarChart3,
  TrendingUp,
  FileBarChart2,
  UserSquare2,
  CheckSquare,
  Bot,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  X,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Tiny external store for the mobile drawer's open state, mirroring the pattern already
// used by components/ui/use-toast.ts. This lets the hamburger button in Topbar (a sibling
// component with no shared parent state) open the drawer rendered here without threading
// props through the (app) layout.
// ---------------------------------------------------------------------------
type Listener = (open: boolean) => void;
let mobileNavOpen = false;
const listeners = new Set<Listener>();

function setMobileNavOpen(open: boolean) {
  mobileNavOpen = open;
  listeners.forEach((listener) => listener(open));
}

/** Called by the hamburger button in components/shell/topbar.tsx. */
export function openMobileNav() {
  setMobileNavOpen(true);
}

function useMobileNavOpen() {
  const [open, setOpen] = useState(mobileNavOpen);
  useEffect(() => {
    listeners.add(setOpen);
    return () => {
      listeners.delete(setOpen);
    };
  }, []);
  return [open, setMobileNavOpen] as const;
}

const COLLAPSE_STORAGE_KEY = 'sme-copilot:sidebar-collapsed';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }] },
  {
    label: 'Sell',
    items: [
      { label: 'Sales', href: '/sales', icon: ShoppingCart },
      { label: 'Customers', href: '/customers', icon: Users },
    ],
  },
  {
    label: 'Stock',
    items: [
      { label: 'Products', href: '/products', icon: Package },
      { label: 'Inventory', href: '/inventory', icon: Boxes },
      { label: 'Suppliers', href: '/suppliers', icon: Truck },
      { label: 'Purchases', href: '/purchases', icon: ClipboardList },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Expenses', href: '/expenses', icon: Receipt },
      { label: 'Invoices', href: '/invoices', icon: FileText },
      { label: 'Payments', href: '/payments', icon: CreditCard },
      { label: 'Analytics', href: '/analytics', icon: BarChart3 },
      { label: 'Cash Flow', href: '/cash-flow', icon: TrendingUp },
      { label: 'Reports', href: '/reports', icon: FileBarChart2 },
    ],
  },
  {
    label: 'Team',
    items: [
      { label: 'Employees', href: '/employees', icon: UserSquare2 },
      { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    ],
  },
  { label: 'Copilot', items: [{ label: 'Copilot', href: '/copilot', icon: Bot }] },
];

function NavLinks({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    collapsed && 'justify-center'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SettingsLink({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <div className="border-t border-border p-2">
      <Link
        href="/settings"
        onClick={onNavigate}
        title={collapsed ? 'Settings' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          collapsed && 'justify-center'
        )}
      >
        <Settings className="h-4 w-4 shrink-0" />
        {!collapsed && <span>Settings</span>}
      </Link>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useMobileNavOpen();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (stored) setCollapsed(stored === '1');
    } catch {
      // localStorage unavailable (private mode, etc.) — default to expanded.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <>
      {/* Persistent desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-150 md:flex',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-3">
          {!collapsed && <span className="truncate font-display text-base font-semibold text-primary">BizPilot</span>}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </Button>
        </div>
        <NavLinks collapsed={collapsed} pathname={pathname} />
        <SettingsLink collapsed={collapsed} />
      </aside>

      {/* Off-canvas drawer for narrow screens — opened via openMobileNav() from Topbar's hamburger button */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/50 md:hidden',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              'fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[80vw] flex-col border-r border-border bg-card shadow-lg outline-none md:hidden',
              'transition-transform duration-200 ease-out data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0'
            )}
          >
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="font-display text-base font-semibold text-primary">BizPilot</span>
              <DialogPrimitive.Close
                className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
            <NavLinks collapsed={false} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <SettingsLink collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

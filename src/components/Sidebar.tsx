"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/products", label: "Products", icon: "📦" },
  { href: "/inventory", label: "Inventory", icon: "🏬" },
  { href: "/customers", label: "Customers", icon: "👥" },
  { href: "/suppliers", label: "Suppliers", icon: "🏭" },
  { href: "/sales", label: "Sales Orders", icon: "💸" },
  { href: "/purchases", label: "Purchase Orders", icon: "🛒" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-6 py-5 text-lg font-semibold tracking-tight">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
          A
        </span>
        <span>Arams ERP</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-6">
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-400">
        v0.1.0 · Demo data
      </div>
    </aside>
  );
}

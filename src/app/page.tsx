import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

async function getStats() {
  const [
    productCount,
    customerCount,
    supplierCount,
    warehouseCount,
    saleAggregate,
    purchaseAggregate,
    stockAggregate,
    recentSales,
    recentPurchases,
    lowStock,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.customer.count(),
    prisma.supplier.count(),
    prisma.warehouse.count(),
    prisma.saleOrder.aggregate({ _sum: { total: true }, _count: true }),
    prisma.purchaseOrder.aggregate({ _sum: { total: true }, _count: true }),
    prisma.stockItem.aggregate({ _sum: { quantity: true } }),
    prisma.saleOrder.findMany({
      include: { customer: true },
      orderBy: { orderDate: "desc" },
      take: 5,
    }),
    prisma.purchaseOrder.findMany({
      include: { supplier: true },
      orderBy: { orderDate: "desc" },
      take: 5,
    }),
    prisma.stockItem.findMany({
      where: { quantity: { lte: 10 } },
      include: { product: true, warehouse: true },
      orderBy: { quantity: "asc" },
      take: 5,
    }),
  ]);

  return {
    productCount,
    customerCount,
    supplierCount,
    warehouseCount,
    salesTotal: saleAggregate._sum.total ?? 0,
    salesCount: saleAggregate._count,
    purchasesTotal: purchaseAggregate._sum.total ?? 0,
    purchasesCount: purchaseAggregate._count,
    stockQuantity: stockAggregate._sum.quantity ?? 0,
    recentSales,
    recentPurchases,
    lowStock,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  const tiles = [
    { label: "Products", value: formatNumber(stats.productCount), href: "/products" },
    { label: "Customers", value: formatNumber(stats.customerCount), href: "/customers" },
    { label: "Suppliers", value: formatNumber(stats.supplierCount), href: "/suppliers" },
    { label: "Warehouses", value: formatNumber(stats.warehouseCount), href: "/inventory" },
    { label: "Sales revenue", value: formatMoney(stats.salesTotal), href: "/sales" },
    { label: "Purchases spend", value: formatMoney(stats.purchasesTotal), href: "/purchases" },
    { label: "Stock on hand", value: formatNumber(stats.stockQuantity), href: "/inventory" },
    { label: "Orders this period", value: formatNumber(stats.salesCount + stats.purchasesCount), href: "/sales" },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your products, stock, and orders."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="card p-4 hover:border-brand-500">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {tile.label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {tile.value}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Recent sales</h2>
            <Link href="/sales" className="text-xs text-brand-600 hover:underline">
              View all →
            </Link>
          </header>
          {stats.recentSales.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No sales yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentSales.map((o) => (
                  <tr key={o.id}>
                    <td className="font-medium">{o.number}</td>
                    <td>{o.customer.name}</td>
                    <td>{formatDate(o.orderDate)}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="text-right">{formatMoney(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Recent purchases</h2>
            <Link href="/purchases" className="text-xs text-brand-600 hover:underline">
              View all →
            </Link>
          </header>
          {stats.recentPurchases.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No purchases yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentPurchases.map((o) => (
                  <tr key={o.id}>
                    <td className="font-medium">{o.number}</td>
                    <td>{o.supplier.name}</td>
                    <td>{formatDate(o.orderDate)}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="text-right">{formatMoney(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card mt-6 overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Low stock alerts</h2>
          <Link href="/inventory" className="text-xs text-brand-600 hover:underline">
            Manage stock →
          </Link>
        </header>
        {stats.lowStock.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No items below threshold.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Warehouse</th>
                <th className="text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {stats.lowStock.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.product.name}</td>
                  <td>{s.product.sku}</td>
                  <td>{s.warehouse.name}</td>
                  <td className="text-right">{formatNumber(s.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

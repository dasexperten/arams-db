import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const orders = await prisma.purchaseOrder.findMany({
    orderBy: { orderDate: "desc" },
    include: { supplier: true, _count: { select: { lines: true } } },
  });

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Goods you order from suppliers."
        actions={
          <Link href="/purchases/new" className="btn-primary">
            + New purchase
          </Link>
        }
      />
      <div className="card overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No purchase orders yet.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Status</th>
                <th className="text-right">Lines</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="font-medium">
                    <Link
                      href={`/purchases/${o.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {o.number}
                    </Link>
                  </td>
                  <td>{o.supplier.name}</td>
                  <td>{formatDate(o.orderDate)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="text-right">{o._count.lines}</td>
                  <td className="text-right">{formatMoney(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

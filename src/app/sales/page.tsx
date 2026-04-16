import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const orders = await prisma.saleOrder.findMany({
    orderBy: { orderDate: "desc" },
    include: { customer: true, _count: { select: { lines: true } } },
  });

  return (
    <>
      <PageHeader
        title="Sales orders"
        description="Orders placed by your customers."
        actions={
          <Link href="/sales/new" className="btn-primary">
            + New sale
          </Link>
        }
      />
      <div className="card overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No sale orders yet.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
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
                      href={`/sales/${o.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {o.number}
                    </Link>
                  </td>
                  <td>{o.customer.name}</td>
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

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { saleOrders: true } } },
  });

  return (
    <>
      <PageHeader
        title="Customers"
        description="People and companies that buy from you."
        actions={
          <Link href="/customers/new" className="btn-primary">
            + New customer
          </Link>
        }
      />
      <div className="card overflow-hidden">
        {customers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No customers yet.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="text-right">Orders</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td>{c.email ?? "—"}</td>
                  <td>{c.phone ?? "—"}</td>
                  <td className="text-right">{c._count.saleOrders}</td>
                  <td>
                    <Link
                      href={`/customers/${c.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

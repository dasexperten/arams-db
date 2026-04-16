import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { purchaseOrders: true } } },
  });

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Vendors you purchase from."
        actions={
          <Link href="/suppliers/new" className="btn-primary">
            + New supplier
          </Link>
        }
      />
      <div className="card overflow-hidden">
        {suppliers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No suppliers yet.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="text-right">Purchases</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td>{s.email ?? "—"}</td>
                  <td>{s.phone ?? "—"}</td>
                  <td className="text-right">{s._count.purchaseOrders}</td>
                  <td>
                    <Link
                      href={`/suppliers/${s.id}`}
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

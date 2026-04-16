import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import OrderLinesEditor from "../OrderLinesEditor";
import { createSaleOrder } from "../actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (customers.length === 0 || products.length === 0) {
    return (
      <>
        <PageHeader title="New sale order" />
        <div className="card p-6 text-sm text-slate-600">
          You need at least one customer and one product before creating a sale
          order.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New sale order" />
      <form action={createSaleOrder} className="card space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Customer</label>
            <select name="customerId" required className="input">
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <input name="notes" className="input" />
          </div>
        </div>

        <OrderLinesEditor products={products} kind="sale" />

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Link href="/sales" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary">
            Create sale order
          </button>
        </div>
      </form>
    </>
  );
}

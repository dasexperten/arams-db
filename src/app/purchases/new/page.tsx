import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import OrderLinesEditor from "@/app/sales/OrderLinesEditor";
import { createPurchaseOrder } from "../actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const [suppliers, products] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (suppliers.length === 0 || products.length === 0) {
    return (
      <>
        <PageHeader title="New purchase order" />
        <div className="card p-6 text-sm text-slate-600">
          You need at least one supplier and one product before creating a
          purchase order.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New purchase order" />
      <form action={createPurchaseOrder} className="card space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Supplier</label>
            <select name="supplierId" required className="input">
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <input name="notes" className="input" />
          </div>
        </div>

        <OrderLinesEditor products={products} kind="purchase" />

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Link href="/purchases" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary">
            Create purchase order
          </button>
        </div>
      </form>
    </>
  );
}

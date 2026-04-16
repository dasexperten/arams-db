import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import OrderLinesEditor from "@/app/sales/OrderLinesEditor";
import {
  changePurchaseStatus,
  deletePurchaseOrder,
  updatePurchaseOrder,
} from "../actions";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const transitions: Record<string, string[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["FULFILLED", "CANCELLED"],
  FULFILLED: [],
  CANCELLED: [],
};

export default async function PurchaseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: { supplier: true, lines: { include: { product: true } } },
  });
  if (!order) notFound();

  const [suppliers, products] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
  ]);

  const editable = order.status === "DRAFT";
  const next = transitions[order.status] ?? [];
  const update = updatePurchaseOrder.bind(null, order.id);
  const remove = deletePurchaseOrder.bind(null, order.id);

  return (
    <>
      <PageHeader
        title={order.number}
        description={`${order.supplier.name} · ${formatDate(order.orderDate)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            {next.map((status) => {
              const act = changePurchaseStatus.bind(null, order.id, status);
              return (
                <form key={status} action={act}>
                  <button className="btn-secondary" type="submit">
                    → {status}
                  </button>
                </form>
              );
            })}
            <form action={remove}>
              <button className="btn-danger">Delete</button>
            </form>
          </div>
        }
      />

      {editable ? (
        <form action={update} className="card space-y-6 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Supplier</label>
              <select
                name="supplierId"
                required
                defaultValue={order.supplierId}
                className="input"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Notes</label>
              <input
                name="notes"
                defaultValue={order.notes ?? ""}
                className="input"
              />
            </div>
          </div>
          <OrderLinesEditor
            products={products}
            kind="purchase"
            initial={order.lines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitCost,
            }))}
          />
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Link href="/purchases" className="btn-secondary">
              Back
            </Link>
            <button className="btn-primary" type="submit">
              Save changes
            </button>
          </div>
        </form>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit cost</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.product.name}</td>
                  <td className="font-mono text-xs">{l.product.sku}</td>
                  <td className="text-right">{l.quantity}</td>
                  <td className="text-right">{formatMoney(l.unitCost)}</td>
                  <td className="text-right">
                    {formatMoney(l.quantity * l.unitCost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right font-semibold">
                  Total
                </td>
                <td className="px-4 py-3 text-right text-lg font-semibold">
                  {formatMoney(order.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {order.notes ? (
        <p className="mt-4 text-sm text-slate-500">
          <strong className="font-semibold text-slate-600">Notes:</strong>{" "}
          {order.notes}
        </p>
      ) : null}
    </>
  );
}

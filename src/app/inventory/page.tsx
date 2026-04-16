import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/format";
import { adjustStock, createWarehouse, deleteWarehouse } from "./actions";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [warehouses, products, stock] = await Promise.all([
    prisma.warehouse.findMany({ orderBy: { code: "asc" } }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.stockItem.findMany({
      include: { product: true, warehouse: true },
      orderBy: [{ warehouse: { code: "asc" } }, { product: { name: "asc" } }],
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Warehouses and on-hand stock."
      />

      <section className="card mb-6 overflow-hidden">
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Warehouses</h2>
        </header>

        <form action={createWarehouse} className="flex flex-wrap gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <input
            name="code"
            placeholder="Code (e.g. WH01)"
            required
            className="input w-36"
          />
          <input name="name" placeholder="Name" required className="input flex-1 min-w-40" />
          <input name="address" placeholder="Address" className="input flex-[2] min-w-60" />
          <button className="btn-primary">+ Add warehouse</button>
        </form>

        {warehouses.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No warehouses yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Address</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {warehouses.map((w) => (
                <tr key={w.id}>
                  <td className="font-mono text-xs">{w.code}</td>
                  <td className="font-medium">{w.name}</td>
                  <td>{w.address ?? "—"}</td>
                  <td>
                    <form action={deleteWarehouse.bind(null, w.id)}>
                      <button className="text-xs text-red-600 hover:underline">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Stock levels</h2>
        </header>

        {products.length > 0 && warehouses.length > 0 ? (
          <form
            action={adjustStock}
            className="flex flex-wrap gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3"
          >
            <select name="productId" required className="input w-60">
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </select>
            <select name="warehouseId" required className="input w-48">
              <option value="">Select warehouse…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
            <input
              name="quantity"
              type="number"
              step="0.01"
              placeholder="Set quantity"
              required
              className="input w-40"
            />
            <button className="btn-primary">Set level</button>
          </form>
        ) : (
          <div className="px-4 py-3 text-xs text-slate-500">
            Create a product and a warehouse to adjust stock.
          </div>
        )}

        {stock.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No stock records.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Warehouse</th>
                <th>Product</th>
                <th>SKU</th>
                <th className="text-right">Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.id}>
                  <td>{s.warehouse.code} · {s.warehouse.name}</td>
                  <td className="font-medium">
                    <Link
                      href={`/products/${s.product.id}`}
                      className="hover:underline"
                    >
                      {s.product.name}
                    </Link>
                  </td>
                  <td className="font-mono text-xs">{s.product.sku}</td>
                  <td className="text-right">{formatNumber(s.quantity)}</td>
                  <td>{s.product.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

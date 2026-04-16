import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { stockItems: true },
  });

  return (
    <>
      <PageHeader
        title="Products"
        description="Catalog of goods and services."
        actions={
          <Link href="/products/new" className="btn-primary">
            + New product
          </Link>
        }
      />

      <div className="card overflow-hidden">
        {products.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No products yet.{" "}
            <Link href="/products/new" className="text-brand-600 hover:underline">
              Create the first one
            </Link>
            .
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Unit</th>
                <th className="text-right">Price</th>
                <th className="text-right">Cost</th>
                <th className="text-right">On hand</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const onHand = p.stockItems.reduce(
                  (sum, s) => sum + s.quantity,
                  0,
                );
                return (
                  <tr key={p.id}>
                    <td className="font-mono text-xs">{p.sku}</td>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.unit}</td>
                    <td className="text-right">{formatMoney(p.price)}</td>
                    <td className="text-right">{formatMoney(p.cost)}</td>
                    <td className="text-right">{onHand}</td>
                    <td>
                      <Link
                        href={`/products/${p.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

export type ProductOption = {
  id: string;
  sku: string;
  name: string;
  price: number;
  cost: number;
};

type Line = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export default function OrderLinesEditor({
  products,
  initial,
  kind,
}: {
  products: ProductOption[];
  initial?: Line[];
  kind: "sale" | "purchase";
}) {
  const [lines, setLines] = useState<Line[]>(
    initial?.length
      ? initial
      : [{ productId: "", quantity: 1, unitPrice: 0 }],
  );

  const priceLabel = kind === "sale" ? "Unit price" : "Unit cost";

  const total = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    [lines],
  );

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  };

  const onProductChange = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    updateLine(idx, {
      productId,
      unitPrice: p ? (kind === "sale" ? p.price : p.cost) : 0,
    });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="table">
          <thead>
            <tr>
              <th className="w-[45%]">Product</th>
              <th className="w-[15%]">Qty</th>
              <th className="w-[20%]">{priceLabel}</th>
              <th className="w-[15%] text-right">Subtotal</th>
              <th className="w-[5%]" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td>
                  <select
                    name="productId"
                    className="input"
                    required
                    value={line.productId}
                    onChange={(e) => onProductChange(idx, e.target.value)}
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="input"
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(idx, { quantity: Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    name="unitPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className="input"
                    value={line.unitPrice}
                    onChange={(e) =>
                      updateLine(idx, { unitPrice: Number(e.target.value) })
                    }
                  />
                </td>
                <td className="text-right font-medium">
                  {formatMoney(line.quantity * line.unitPrice)}
                </td>
                <td>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() =>
                        setLines(lines.filter((_, i) => i !== idx))
                      }
                    >
                      ✕
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            setLines([
              ...lines,
              { productId: "", quantity: 1, unitPrice: 0 },
            ])
          }
        >
          + Add line
        </button>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Total
          </div>
          <div className="text-xl font-semibold">{formatMoney(total)}</div>
        </div>
      </div>
    </div>
  );
}

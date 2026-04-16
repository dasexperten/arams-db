import Link from "next/link";

type Product = {
  id?: string;
  sku?: string;
  name?: string;
  description?: string | null;
  unit?: string;
  price?: number;
  cost?: number;
};

export default function ProductForm({
  product,
  action,
  submitLabel,
}: {
  product?: Product;
  action: (formData: FormData) => void;
  submitLabel: string;
}) {
  return (
    <form action={action} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">SKU</label>
          <input
            name="sku"
            required
            defaultValue={product?.sku ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">Unit</label>
          <input
            name="unit"
            defaultValue={product?.unit ?? "pcs"}
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label">Name</label>
        <input
          name="name"
          required
          defaultValue={product?.name ?? ""}
          className="input"
        />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={product?.description ?? ""}
          className="input"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Selling price</label>
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.price ?? 0}
            className="input"
          />
        </div>
        <div>
          <label className="label">Unit cost</label>
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.cost ?? 0}
            className="input"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Link href="/products" className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

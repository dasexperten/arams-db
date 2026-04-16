import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ProductForm from "../ProductForm";
import { deleteProduct, updateProduct } from "../actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product) notFound();

  const update = updateProduct.bind(null, product.id);
  const remove = deleteProduct.bind(null, product.id);

  return (
    <>
      <PageHeader
        title={`Edit: ${product.name}`}
        description={`SKU ${product.sku}`}
        actions={
          <form action={remove}>
            <button className="btn-danger" type="submit">
              Delete
            </button>
          </form>
        }
      />
      <ProductForm
        product={product}
        action={update}
        submitLabel="Save changes"
      />
    </>
  );
}

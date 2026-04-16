import PageHeader from "@/components/PageHeader";
import ProductForm from "../ProductForm";
import { createProduct } from "../actions";

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="New product" description="Create a new catalog item." />
      <ProductForm action={createProduct} submitLabel="Create product" />
    </>
  );
}

import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ContactForm from "@/components/ContactForm";
import { deleteSupplier, updateSupplier } from "../actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({
  params,
}: {
  params: { id: string };
}) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: params.id },
  });
  if (!supplier) notFound();

  const update = updateSupplier.bind(null, supplier.id);
  const remove = deleteSupplier.bind(null, supplier.id);

  return (
    <>
      <PageHeader
        title={`Edit: ${supplier.name}`}
        actions={
          <form action={remove}>
            <button className="btn-danger">Delete</button>
          </form>
        }
      />
      <ContactForm
        contact={supplier}
        action={update}
        cancelHref="/suppliers"
        submitLabel="Save changes"
      />
    </>
  );
}

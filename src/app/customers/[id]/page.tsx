import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ContactForm from "@/components/ContactForm";
import { deleteCustomer, updateCustomer } from "../actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
  });
  if (!customer) notFound();

  const update = updateCustomer.bind(null, customer.id);
  const remove = deleteCustomer.bind(null, customer.id);

  return (
    <>
      <PageHeader
        title={`Edit: ${customer.name}`}
        actions={
          <form action={remove}>
            <button className="btn-danger">Delete</button>
          </form>
        }
      />
      <ContactForm
        contact={customer}
        action={update}
        cancelHref="/customers"
        submitLabel="Save changes"
      />
    </>
  );
}

import PageHeader from "@/components/PageHeader";
import ContactForm from "@/components/ContactForm";
import { createSupplier } from "../actions";

export default function NewSupplierPage() {
  return (
    <>
      <PageHeader title="New supplier" />
      <ContactForm
        action={createSupplier}
        cancelHref="/suppliers"
        submitLabel="Create supplier"
      />
    </>
  );
}

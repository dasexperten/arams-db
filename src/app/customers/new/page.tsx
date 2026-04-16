import PageHeader from "@/components/PageHeader";
import ContactForm from "@/components/ContactForm";
import { createCustomer } from "../actions";

export default function NewCustomerPage() {
  return (
    <>
      <PageHeader title="New customer" />
      <ContactForm
        action={createCustomer}
        cancelHref="/customers"
        submitLabel="Create customer"
      />
    </>
  );
}

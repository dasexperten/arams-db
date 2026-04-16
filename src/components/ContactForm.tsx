import Link from "next/link";

export type Contact = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
};

export default function ContactForm({
  contact,
  action,
  cancelHref,
  submitLabel,
}: {
  contact?: Contact;
  action: (formData: FormData) => void;
  cancelHref: string;
  submitLabel: string;
}) {
  return (
    <form action={action} className="card max-w-2xl space-y-4 p-6">
      <div>
        <label className="label">Name</label>
        <input
          name="name"
          required
          defaultValue={contact?.name ?? ""}
          className="input"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">Phone</label>
          <input
            name="phone"
            defaultValue={contact?.phone ?? ""}
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label">Address</label>
        <input
          name="address"
          defaultValue={contact?.address ?? ""}
          className="input"
        />
      </div>
      <div>
        <label className="label">Tax ID</label>
        <input
          name="taxId"
          defaultValue={contact?.taxId ?? ""}
          className="input"
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Link href={cancelHref} className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

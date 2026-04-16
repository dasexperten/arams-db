"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
});

function parse(formData: FormData) {
  return schema.parse({
    name: formData.get("name"),
    email: formData.get("email") || null,
    phone: formData.get("phone") || null,
    address: formData.get("address") || null,
    taxId: formData.get("taxId") || null,
  });
}

export async function createSupplier(formData: FormData) {
  const data = parse(formData);
  await prisma.supplier.create({
    data: { ...data, email: data.email || null },
  });
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function updateSupplier(id: string, formData: FormData) {
  const data = parse(formData);
  await prisma.supplier.update({
    where: { id },
    data: { ...data, email: data.email || null },
  });
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function deleteSupplier(id: string) {
  await prisma.supplier.delete({ where: { id } });
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

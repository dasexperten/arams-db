"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const productSchema = z.object({
  sku: z.string().min(1, "SKU is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().optional().nullable(),
  unit: z.string().min(1).max(20).default("pcs"),
  price: z.coerce.number().min(0).default(0),
  cost: z.coerce.number().min(0).default(0),
});

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return productSchema.parse({
    sku: raw.sku,
    name: raw.name,
    description: raw.description || null,
    unit: raw.unit || "pcs",
    price: raw.price || 0,
    cost: raw.cost || 0,
  });
}

export async function createProduct(formData: FormData) {
  const data = parseForm(formData);
  await prisma.product.create({ data });
  revalidatePath("/products");
  redirect("/products");
}

export async function updateProduct(id: string, formData: FormData) {
  const data = parseForm(formData);
  await prisma.product.update({ where: { id }, data });
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  redirect("/products");
}

export async function deleteProduct(id: string) {
  await prisma.product.delete({ where: { id } });
  revalidatePath("/products");
  redirect("/products");
}

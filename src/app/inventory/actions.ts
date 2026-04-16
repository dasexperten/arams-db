"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const warehouseSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  address: z.string().optional().nullable(),
});

export async function createWarehouse(formData: FormData) {
  const data = warehouseSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    address: formData.get("address") || null,
  });
  await prisma.warehouse.create({ data });
  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function deleteWarehouse(id: string) {
  await prisma.warehouse.delete({ where: { id } });
  revalidatePath("/inventory");
  redirect("/inventory");
}

const adjustSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number(),
});

export async function adjustStock(formData: FormData) {
  const data = adjustSchema.parse({
    productId: formData.get("productId"),
    warehouseId: formData.get("warehouseId"),
    quantity: formData.get("quantity"),
  });

  await prisma.stockItem.upsert({
    where: {
      productId_warehouseId: {
        productId: data.productId,
        warehouseId: data.warehouseId,
      },
    },
    create: {
      productId: data.productId,
      warehouseId: data.warehouseId,
      quantity: data.quantity,
    },
    update: {
      quantity: data.quantity,
    },
  });

  revalidatePath("/inventory");
  redirect("/inventory");
}

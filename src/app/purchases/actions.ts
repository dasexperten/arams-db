"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { nextPurchaseOrderNumber } from "@/lib/orderNumber";

const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
});

const orderSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

function parseOrder(formData: FormData) {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const costs = formData.getAll("unitPrice").map(String);

  const lines = productIds
    .map((productId, i) => ({
      productId,
      quantity: quantities[i],
      unitCost: costs[i],
    }))
    .filter((l) => l.productId && Number(l.quantity) > 0);

  return orderSchema.parse({
    supplierId: formData.get("supplierId"),
    notes: formData.get("notes") || null,
    lines,
  });
}

function linesTotal(lines: { quantity: number; unitCost: number }[]) {
  return lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
}

export async function createPurchaseOrder(formData: FormData) {
  const data = parseOrder(formData);
  const number = await nextPurchaseOrderNumber();
  const total = linesTotal(data.lines);

  const order = await prisma.purchaseOrder.create({
    data: {
      number,
      supplierId: data.supplierId,
      notes: data.notes,
      total,
      lines: { create: data.lines },
    },
  });

  revalidatePath("/purchases");
  redirect(`/purchases/${order.id}`);
}

export async function updatePurchaseOrder(id: string, formData: FormData) {
  const data = parseOrder(formData);
  const total = linesTotal(data.lines);

  await prisma.$transaction([
    prisma.purchaseOrderLine.deleteMany({ where: { orderId: id } }),
    prisma.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: data.supplierId,
        notes: data.notes,
        total,
        lines: { create: data.lines },
      },
    }),
  ]);

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${id}`);
  redirect(`/purchases/${id}`);
}

export async function deletePurchaseOrder(id: string) {
  await prisma.purchaseOrder.delete({ where: { id } });
  revalidatePath("/purchases");
  redirect("/purchases");
}

export async function changePurchaseStatus(id: string, status: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!order) return;

  if (status === "FULFILLED" && order.status !== "FULFILLED") {
    const warehouse = await prisma.warehouse.findFirst();
    if (warehouse) {
      for (const line of order.lines) {
        await prisma.stockItem.upsert({
          where: {
            productId_warehouseId: {
              productId: line.productId,
              warehouseId: warehouse.id,
            },
          },
          create: {
            productId: line.productId,
            warehouseId: warehouse.id,
            quantity: line.quantity,
          },
          update: { quantity: { increment: line.quantity } },
        });
      }
    }
  }

  await prisma.purchaseOrder.update({ where: { id }, data: { status } });
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${id}`);
}

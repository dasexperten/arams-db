"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { nextSaleOrderNumber } from "@/lib/orderNumber";

const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
});

const orderSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

function parseOrder(formData: FormData) {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const prices = formData.getAll("unitPrice").map(String);

  const lines = productIds
    .map((productId, i) => ({
      productId,
      quantity: quantities[i],
      unitPrice: prices[i],
    }))
    .filter((l) => l.productId && Number(l.quantity) > 0);

  return orderSchema.parse({
    customerId: formData.get("customerId"),
    notes: formData.get("notes") || null,
    lines,
  });
}

function linesTotal(lines: { quantity: number; unitPrice: number }[]) {
  return lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}

export async function createSaleOrder(formData: FormData) {
  const data = parseOrder(formData);
  const number = await nextSaleOrderNumber();
  const total = linesTotal(data.lines);

  const order = await prisma.saleOrder.create({
    data: {
      number,
      customerId: data.customerId,
      notes: data.notes,
      total,
      lines: { create: data.lines },
    },
  });

  revalidatePath("/sales");
  redirect(`/sales/${order.id}`);
}

export async function updateSaleOrder(id: string, formData: FormData) {
  const data = parseOrder(formData);
  const total = linesTotal(data.lines);

  await prisma.$transaction([
    prisma.saleOrderLine.deleteMany({ where: { orderId: id } }),
    prisma.saleOrder.update({
      where: { id },
      data: {
        customerId: data.customerId,
        notes: data.notes,
        total,
        lines: { create: data.lines },
      },
    }),
  ]);

  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}`);
}

export async function deleteSaleOrder(id: string) {
  await prisma.saleOrder.delete({ where: { id } });
  revalidatePath("/sales");
  redirect("/sales");
}

export async function changeSaleStatus(id: string, status: string) {
  const order = await prisma.saleOrder.findUnique({
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
            quantity: -line.quantity,
          },
          update: { quantity: { decrement: line.quantity } },
        });
      }
    }
  }

  await prisma.saleOrder.update({ where: { id }, data: { status } });
  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
}

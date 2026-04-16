import { prisma } from "./prisma";

export async function nextSaleOrderNumber() {
  const count = await prisma.saleOrder.count();
  return `SO-${String(count + 1).padStart(5, "0")}`;
}

export async function nextPurchaseOrderNumber() {
  const count = await prisma.purchaseOrder.count();
  return `PO-${String(count + 1).padStart(5, "0")}`;
}

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database…");

  await prisma.saleOrderLine.deleteMany();
  await prisma.saleOrder.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.stockItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.warehouse.deleteMany();

  const [main, overflow] = await Promise.all([
    prisma.warehouse.create({
      data: { code: "WH01", name: "Main warehouse", address: "100 Dock Rd" },
    }),
    prisma.warehouse.create({
      data: { code: "WH02", name: "Overflow", address: "25 Back Lot" },
    }),
  ]);

  const products = await Promise.all(
    [
      { sku: "CHR-001", name: "Ergo office chair", price: 249, cost: 120 },
      { sku: "DSK-010", name: "Standing desk 160cm", price: 599, cost: 340 },
      { sku: "LMP-015", name: "LED desk lamp", price: 49, cost: 18 },
      { sku: "MON-022", name: '27" 4K monitor', price: 449, cost: 280 },
      { sku: "KBD-030", name: "Mechanical keyboard", price: 129, cost: 55 },
    ].map((p) =>
      prisma.product.create({
        data: { ...p, unit: "pcs", description: "" },
      }),
    ),
  );

  for (const product of products) {
    await prisma.stockItem.createMany({
      data: [
        { productId: product.id, warehouseId: main.id, quantity: 25 },
        { productId: product.id, warehouseId: overflow.id, quantity: 5 },
      ],
    });
  }

  const [acme, globex] = await Promise.all([
    prisma.customer.create({
      data: {
        name: "Acme Corp",
        email: "orders@acme.test",
        phone: "+1 555 0100",
        address: "1 Infinite Loop",
      },
    }),
    prisma.customer.create({
      data: {
        name: "Globex Ltd",
        email: "buy@globex.test",
        phone: "+1 555 0200",
      },
    }),
  ]);

  const [officeplus, furniEU] = await Promise.all([
    prisma.supplier.create({
      data: {
        name: "OfficePlus Wholesale",
        email: "sales@officeplus.test",
        phone: "+1 555 0300",
      },
    }),
    prisma.supplier.create({
      data: {
        name: "FurniEU GmbH",
        email: "orders@furnieu.test",
        phone: "+49 30 1234567",
      },
    }),
  ]);

  const saleLines = [
    { productId: products[0].id, quantity: 2, unitPrice: products[0].price },
    { productId: products[2].id, quantity: 4, unitPrice: products[2].price },
  ];
  await prisma.saleOrder.create({
    data: {
      number: "SO-00001",
      customerId: acme.id,
      status: "CONFIRMED",
      notes: "Ship to office entrance",
      total: saleLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      lines: { create: saleLines },
    },
  });

  const saleLines2 = [
    { productId: products[1].id, quantity: 1, unitPrice: products[1].price },
    { productId: products[3].id, quantity: 2, unitPrice: products[3].price },
  ];
  await prisma.saleOrder.create({
    data: {
      number: "SO-00002",
      customerId: globex.id,
      status: "DRAFT",
      total: saleLines2.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      lines: { create: saleLines2 },
    },
  });

  const purchaseLines = [
    { productId: products[0].id, quantity: 20, unitCost: products[0].cost },
    { productId: products[4].id, quantity: 30, unitCost: products[4].cost },
  ];
  await prisma.purchaseOrder.create({
    data: {
      number: "PO-00001",
      supplierId: officeplus.id,
      status: "CONFIRMED",
      total: purchaseLines.reduce((s, l) => s + l.quantity * l.unitCost, 0),
      lines: { create: purchaseLines },
    },
  });

  const purchaseLines2 = [
    { productId: products[1].id, quantity: 10, unitCost: products[1].cost },
  ];
  await prisma.purchaseOrder.create({
    data: {
      number: "PO-00002",
      supplierId: furniEU.id,
      status: "DRAFT",
      total: purchaseLines2.reduce((s, l) => s + l.quantity * l.unitCost, 0),
      lines: { create: purchaseLines2 },
    },
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

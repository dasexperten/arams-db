# Arams ERP

A small ERP starter built with **Next.js 14 (App Router)**, **TypeScript**,
**Prisma**, **SQLite** and **Tailwind CSS**. Server actions handle all
mutations; there is no separate API layer.

## Modules

- **Dashboard** — KPI tiles, recent orders, low-stock alerts (`/`).
- **Products** — catalog with SKU, unit, price and cost (`/products`).
- **Inventory** — warehouses and per-warehouse stock levels (`/inventory`).
- **Customers** — contacts for sales (`/customers`).
- **Suppliers** — contacts for purchases (`/suppliers`).
- **Sales orders** — multi-line orders with `DRAFT → CONFIRMED → FULFILLED`
  flow. Fulfilment decrements stock (`/sales`).
- **Purchase orders** — multi-line orders with the same status flow.
  Fulfilment increments stock (`/purchases`).

## Getting started

```bash
cp .env.example .env
npm install
npx prisma db push      # create the SQLite schema
npm run db:seed         # optional: load demo data
npm run dev
```

Open http://localhost:3000.

## Stack

- Next.js 14 · React 18 · TypeScript 5
- Prisma ORM + SQLite (swap the `provider` in `prisma/schema.prisma` to
  PostgreSQL or MySQL for production)
- Tailwind CSS
- Zod for input validation inside server actions

## Project layout

```
prisma/
  schema.prisma     # ERP data model
  seed.ts           # demo data
src/
  app/              # routes (dashboard + each module)
  components/       # shared UI (sidebar, page header, forms, badges)
  lib/              # prisma client, formatters, order numbering
```

## Notes

- Inventory movements are intentionally simple: fulfilling a sale or
  purchase adjusts stock in the first warehouse. Production use would
  add a dedicated stock-movement log and let the user pick a warehouse.
- Auth is not included yet — run it on a trusted network or add
  `next-auth` before exposing it.

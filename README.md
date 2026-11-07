# Adwoaba's Lounge

Stock, sales and customer app for Adwoaba's Lounge (heels, handbags, perfumes).

An installable phone app (PWA) that works offline and syncs between phones through Firebase.

**App:** https://thehypehousegh.github.io/Adwoaba-s-Lounge-/
**First-time setup:** see [SETUP.md](SETUP.md)

## Features

* **Home:** big buttons for New sale, New stock, View stock, Search products, Sales history, Add product, Take stock, Low stock, Customers, Deliveries & suppliers, Expenses, Reports.
* **Products:** any category (e.g. Hermes), each product with several colours, each colour with its own sizes, quantities and prices. Bags and perfumes use "One size".
* **New stock (deliveries):** date bought, supplier, and per line colour, size, quantity, cost price and selling price (both optional). Other costs (transport, customs...) are either spread into the unit cost or counted as an expense. If the new selling price differs from stock you already have, you choose to keep the old price for those pieces or change them all.
* **Cost per delivery:** each delivery keeps its own cost. Sales take from the oldest delivery first, and profit uses that delivery's cost. Costs added to a delivery later update profit on earlier sales.
* **Product page:** Update stock (add, remove, correct count, change prices, edit details), Sell, and tabs for Stock, Sales, Deliveries and History.
* **Take stock:** count each colour/size, optionally with cost and selling price.
* **Search:** several words across name, category and colour (e.g. "zara heels black"), covering all stock unless you filter by supplier or purchase dates.
* **Sales:** price fills in automatically and can be changed or left blank (marked "price missing" until added). Payment method, delivery with name, address and status, shareable receipt. Cancelling a sale returns items to stock and to their delivery.
* **Expenses:** rent, salaries, data and so on.
* **Reports** for any period: sales, cost of items sold, gross profit, expenses, net profit, stock bought by supplier, breakdowns by category, product, colour/size, payment method, day and customer, and current stock value. CSV download and print/PDF.
* **Offline:** works without internet after the first sign-in; several phones sync and merge correctly.

## Development

```bash
npm install
npm run dev
```

To test without a real Firebase project, run the local emulators (needs Java):

```bash
npx firebase-tools emulators:start --project demo-adwoaba
```

```bash
VITE_EMULATORS=1 npm run dev
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Data (Firestore)

| Collection | Contents |
| --- | --- |
| `categories` | name, order |
| `products` | name, categoryId, default price/cost, sizeAlert, totalAlert, sizes `{ "Black\|38": 3, "38": 2 }`, prices and costs per colour/size |
| `deliveries` | date, supplier, note, items `[{ productId, variant, qty, cost, price }]`, otherCosts `[{ label, amount, mode: spread or expense }]` |
| `lots` | one per delivery line: qty, remaining, unitCost (incl. spread costs), price, supplier, date |
| `expenses` | date, description, amount |
| `sales` | date, items `[{ productId, productName, size (colour/size), qty, price, lots }]`, total, paymentMethod, customer, delivery `{ name, address, status }`, note, by |
| `customers` | name, phone, address, notes |
| `movements` | every stock change: productId, size, change, reason, note, date, by |
| `meta/settings` | default alert thresholds |

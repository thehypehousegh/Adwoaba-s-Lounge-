# Adwoaba's Lounge

Stock, sales and customer app for Adwoaba's Lounge (heels, handbags, perfumes).

An installable phone app (PWA) that works offline and syncs between phones through Firebase.

**App:** https://thehypehousegh.github.io/Adwoaba-s-Lounge-/
**First-time setup:** see [SETUP.md](SETUP.md)

## Features

* **Stock:** products by category with quantity per size, search and filters, receive new stock, take stock (count and correct), full stock history.
* **Sales:** multiple items per sale, size and price per item, payment method (Cash, Mobile Money, Bank transfer, Card, Other), optional delivery with name, address and a status you can update (Pending, Out for delivery, Delivered, Cancelled). Share a receipt on WhatsApp/SMS. Cancelling a sale returns the items to stock.
* **Shortage alerts:** per size and per product total, with thresholds set per product or as shop-wide defaults.
* **Customers:** contact details, notes, purchase history and total spent, call or WhatsApp in one tap.
* **Reports** for any date range (today, this week, this month, last month, this year or custom): sales, items sold, gross profit, stock received, breakdowns by category, product, size, payment method, day, customer and delivery status, and current stock value. Download as CSV or print/save as PDF.
* **Offline:** works without internet after the first sign-in; changes sync automatically. Stock changes from several phones merge correctly.
* **Backup:** download everything as a JSON file from Settings.

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
| `products` | name, categoryId, price, cost, sizeAlert, totalAlert, sizes `{ "38": 3, "mixed": 7 }`, mixedNote |
| `sales` | date, items `[{ productId, productName, size, qty, price, cost }]`, total, paymentMethod, customer, delivery `{ name, address, status }`, note, by |
| `customers` | name, phone, address, notes |
| `movements` | every stock change: productId, size, change, reason, note, date, by |
| `meta/settings` | default alert thresholds |

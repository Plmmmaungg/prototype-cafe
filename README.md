# Cafe Munaco — Integrated Cafe Operations & Business Intelligence

A runnable React + Express + MySQL starter application based on the supplied Cafe Munaco Master Development Prompt. It uses the requested XAMPP MySQL port **3307** and keeps the frontend, backend, and SQL database in separate folders.

## Included in this ZIP

- Premium responsive coffee/cream/gold management interface.
- Full point-of-sale screen for Owner / Manager and Cashier: product image grid, cart, promo selection, cash/GCash/card payment, change calculation, printable receipt, and required customer name/cash-received validation. The order-summary cart stays within the desktop viewport and keeps payment controls visible while the order list scrolls.
- Working topbar low-stock notifications: a live alert count, item list with current/minimum stock, manual refresh, and a direct link to Inventory for permitted roles.
- Product image upload and product management (add, edit, archive, restore).
- Promo management for Owner / Manager: create, edit, delete, target a product or the whole order, and set start/expiry date and time. Expired promos disappear from the POS automatically.
- Login with JWT and bcrypt password verification.
- Three seeded demo roles: Owner / Manager, Cashier / Service Staff, and Kitchen Personnel.
- Role-filtered navigation and protected frontend routes, plus backend permission checks for dashboard, products, orders, reservations, inventory, waste, and activity logs.
- Cashier order/reservation workflow and kitchen-only preparation status workflow.
- Owner dashboard with live MySQL summary, recent orders, and a 7-day sales chart.
- Product/menu creation and archive endpoint.
- Inventory creation, stock-in, stock-out, low-stock indication, and movement history writes.
- Order creation, order list, status transition validation, and kitchen queue view.
- Reservation creation/list.
- Food waste recording that deducts inventory in a database transaction.
- Owner activity log view.
- Importable MySQL schema with clearly identified demonstration menu and inventory rows.

## Requirements

1. Windows 10/11
2. Node.js 18 or newer and npm
3. VS Code
4. XAMPP with MySQL enabled and configured to listen on port **3307**

## 1. Prepare MySQL in XAMPP

1. Open XAMPP Control Panel and start **MySQL**. Apache is not required for this React/Express application.
2. Open phpMyAdmin: `http://localhost/phpmyadmin`.
3. Select **Import**.
4. Choose `database/cafe_munaco_db.sql` from this project folder.
5. Click **Import** / **Go** and confirm that `cafe_munaco_db` was created.

The SQL file creates the database and tables. It also inserts a small set of clearly intended demo products and ingredients so you can explore the interface. Importing this SQL again drops and recreates the project's tables, so do not re-import over data you need to keep.

> If your phpMyAdmin is configured to connect to a different MySQL instance/port, adjust its MySQL configuration or import using the MySQL CLI for the instance listening on 3307. The Node backend itself reads `DB_PORT=3307` from `.env`.

## 2. Open the project in VS Code

1. Extract `cafe-munaco.zip` to a convenient folder, such as `C:\Users\YOUR_NAME\Downloads\cafe-munaco`.
2. Open VS Code.
3. Choose **File → Open Folder** and select the extracted `cafe-munaco` folder.
4. Open **Terminal → New Terminal**.

## 3. Configure the backend

In the VS Code terminal, run:

```powershell
cd backend
copy .env.example .env
```

Open `backend/.env` and verify the values. For a typical local XAMPP installation with a blank root password:

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=cafe_munaco_db
DB_PORT=3307
JWT_SECRET=replace_this_with_a_long_random_secret
CLIENT_URL=http://localhost:5173
```

If your MySQL root account has a password, put it after `DB_PASSWORD=`. Change `JWT_SECRET` to a long random value before using real accounts.

Then install backend packages and create/reset the three demo accounts:

```powershell
npm install
npm run seed
```

The seed command prints the demo login credentials when successful.

## 4. Start the backend

Keep the backend terminal open and run:

```powershell
npm run dev
```

Expected message:

```text
Cafe Munaco API listening on port 5000
```

Test it in your browser at `http://localhost:5000/` or `http://localhost:5000/api/health`. The health endpoint should report that the database is connected.

## 5. Start the frontend

Open a **second** VS Code terminal (Terminal → New Terminal). From the project root run:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally:

`http://localhost:5173`

## 6. Demo accounts

Run `npm run seed` in the `backend` folder. It creates or resets these three local demo accounts (passwords are stored as bcrypt hashes):

| Role | Email | Password |
|---|---|---|
| Owner / Manager | `admin@cafemunaco.local` | `CafeMunaco123!` |
| Cashier / Service Staff | `cashier@cafemunaco.local` | `Cashier123!` |
| Kitchen Personnel | `kitchen@cafemunaco.local` | `Kitchen123!` |

These are demonstration credentials. Change them before using the system with real business data. Re-running `npm run seed` resets the demo passwords to the values above.

### Updating an existing database for POS + promos

If you already imported an older copy of `database/cafe_munaco_db.sql`, run this once from the `backend` folder:

```powershell
npm run migrate
```

The migration adds product images, the `promos` table, and the POS payment/discount fields on `orders`, then inserts demo promos. You can also import `database/migration_pos_promos.sql` in phpMyAdmin instead. A fresh import of the updated `database/cafe_munaco_db.sql` already includes everything.

## 7. Role access and workflow

- **Owner / Manager:** full application access, including the POS, product images, and promo management.
- **Cashier / Service Staff:** lands on the Point of Sale; can build a cart, apply an active promo, take cash/GCash/card payment, print a receipt, and manage Orders and Reservations.
- **Kitchen Personnel:** Kitchen Display only. Click any order row to open the full ticket: all ordered items, customer details, special instructions, payment summary, and the next kitchen status action. Orders with a special instruction are marked with a `Note` badge. Kitchen staff can move Confirmed orders to Preparing and Preparing orders to Ready. POS sales are created as Confirmed so they appear in the kitchen queue immediately.

The sidebar is filtered by role, direct frontend URL access is redirected, and backend endpoints enforce permissions independently. The role restrictions are not just hidden buttons.

## Running it next time

1. Start XAMPP MySQL.
2. Open the project in VS Code.
3. Terminal 1: `cd backend` then `npm run dev`.
4. Terminal 2: `cd frontend` then `npm run dev`.
5. Browse to `http://localhost:5173`.

## 8. Troubleshooting

**Backend says ECONNREFUSED / database connection failed**
- Confirm XAMPP MySQL is running.
- Confirm the MySQL port is 3307 (not 3306).
- Confirm `.env` has the correct DB user/password and `DB_PORT=3307`.
- Confirm `cafe_munaco_db` exists in phpMyAdmin.

**Login says invalid email or password**
- Run `npm run seed` again from the `backend` folder.
- Confirm the seed command completed without an error.

**Frontend cannot connect**
- Keep the backend running on port 5000.
- Open `http://localhost:5000/api/health` and verify the database connection.
- Check that `CLIENT_URL` in backend `.env` is `http://localhost:5173`.

**Port already in use**
- Stop the other process using port 5000 or 5173, or change the corresponding port and update the frontend API URL/CORS configuration consistently.

## Project structure

```text
cafe-munaco/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── POS.jsx
│   │   ├── Products.jsx
│   │   ├── Promos.jsx
│   │   ├── OrderDetailModal.jsx
│   │   ├── NotificationBell.jsx
│   │   ├── posUtils.js
│   │   ├── api.js
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── db.js
│   ├── middleware.js
│   ├── server.js
│   ├── seed.js
│   ├── migrate.js
│   ├── .env.example
│   └── package.json
├── database/
│   ├── cafe_munaco_db.sql
│   └── migration_pos_promos.sql
└── README.md
```

## Important implementation notes for your defense

This ZIP is a working foundation/MVP, not a claim that every item in the 27-page specification is finished. The included modules communicate with the same MySQL database for the workflows listed above. The POS now supports multi-product carts, product/promo images, order-level or product-specific promos, cash/GCash/card payment, change calculation, printable receipts, time-based promo expiry, required customer/cash fields, and a viewport-safe order-summary cart. The topbar bell reports live low-stock alerts. The following larger requirements still need to be implemented and tested before presenting them as completed: employee account administration (creating and deactivating staff from the UI) and a full customizable role/permission matrix; recipe management and automatic ingredient reservation/deduction tied to order completion; Socket.IO real-time synchronization; reservation conflict/capacity validation and calendar; QR public menu and secure order tracking; detailed sales/product/peak-hour/inventory/waste analytics and CSV reports; and comprehensive automated tests. Analytics currently displays the live dashboard summary and 7-day sales data available in this starter.

Do not use the demo data as actual Cafe Munaco business records. Replace it with authorized real records and test each business workflow before the system defense.

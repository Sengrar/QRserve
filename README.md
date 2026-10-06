# QRServe 🍽️

> **Next-Generation Multi-Tenant Restaurant QR Ordering, Service & Kitchen Management Platform**

QRServe is a modern, enterprise-ready multi-tenant digital menu and table QR ordering platform designed specifically for restaurants with **counter-pay** workflows. It eliminates expensive third-party ordering aggregator commissions and payment gateway transaction fees by allowing diners to order directly from table-specific QR codes while paying at the restaurant counter.

---

## 🌟 Key Highlights & Feature Matrix

### 📱 Customer Dine-In Experience
- **Frictionless QR Table Ordering:** Diners scan a table QR code to browse dynamic categorized menus with photos, descriptions, and dietary indicators without app installs.
- **Smart Cart & Discount Validation:** Dynamic shopping cart with real-time tax calculation and discount coupon code redemption with spend thresholds and maximum discount caps.
- **Instant Waiter & Service Requests:** Diners can request assistance directly from their table with 1 tap (`Call Waiter`, `Water Refill`, `Cutlery`, `Table Cleaning`, or `Other`).
- **Digital Receipt & Order History:** Itemized customer bills with order tokens, status tracking, CGST/SGST breakdowns, and a post-checkout **Google Reviews booster** redirect.
- **Counter-Pay Optimization:** Zero payment gateway commission deductions — customers order smoothly and pay at the counter via cash, UPI, or card.

### 🏢 Restaurant Management Portal
- **Real-Time Live Kitchen Order Queue:** Visual order pipeline with instant status updates (`SUBMITTED` ➔ `CONFIRMED` ➔ `PREPARING` ➔ `SERVED` ➔ `COMPLETED` / `CANCELLED`).
- **Digital Menu Engineering:** Real-time category and item management, stock availability toggles, image uploads, and item-level tax overrides.
- **Table & QR Code Studio:** Create tables, monitor real-time availability (`AVAILABLE`, `OCCUPIED`, `RESERVED`), and generate/download branded printable QR codes with cryptographically signed tokens.
- **Comprehensive Indian GST Engine:** Toggle GST on/off, configure GSTIN, legal business name, inclusive or exclusive tax modes, and automatic CGST/SGST itemized splits.
- **Promotional Coupon System:** Launch percentage or fixed-amount promotional codes with custom validity windows, minimum order values, maximum discount caps, and customer usage limits.
- **Service Request Desk:** Interactive alert board for staff to acknowledge and resolve diner service requests in real time.
- **Business Performance Analytics:** Comprehensive KPI dashboards with total revenue, order count, average ticket size, daily sales distribution, and top-selling menu items.

### 👑 Super Admin Governance & Billing
- **Strict Multi-Tenant Approval Governance:**
  - **Approval (`PENDING | APPROVED | REJECTED`):** Super Admin verifies legitimacy before any restaurant goes live.
  - **Activation (`isActive`):** Controlled by restaurant owners once approved. Cannot be activated if pending or suspended.
  - **Emergency Suspension (`isSuspended`):** Instant kill-switch preventing public QR ordering access.
- **Tiered Subscription Plans:** `SMALL` (10 tables), `MEDIUM` (25 tables), and `LARGE` (50 tables) with monthly and annual billing cycles, custom pricing overrides, and table quota enforcement.
- **Offline UPI & Bank Transfer Approvals:** Native support for Indian payment methods (UPI ID, QR code, IMPS/NEFT) where owners upload UTR references and receipt proofs for Super Admin verification.
- **Global Platform Payment Settings:** Super Admin can configure platform UPI VPA, payee name, bank account numbers, IFSC codes, and payment instructions.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Server Actions, Route Handlers) |
| **Runtime & Language** | [Node.js 20+](https://nodejs.org/) & [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode) |
| **Frontend & UI** | [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) Icons |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/) (Local, Neon Serverless, or Supabase) with [Prisma ORM 6](https://www.prisma.io/) |
| **Validation** | [Zod](https://zod.dev/) type-safe schema validation |
| **Authentication & Security** | [jose](https://github.com/panva/jose) (Stateless JWT signed HttpOnly cookies), [bcryptjs](https://github.com/dcodeIO/bcrypt.js) (12 rounds) |
| **QR Code Generation** | [qrcode](https://github.com/soldair/node-qrcode) SVG/Canvas high-density generation |
| **Testing** | [Vitest](https://vitest.dev/) (30 test suites, 327 comprehensive unit & integration tests) |

---

## 📁 Repository Architecture

```text
qrserve/
├── prisma/
│   ├── schema.prisma                  # Data models: Multi-tenant schemas, orders, taxes, coupons, billing
│   └── migrations/                    # Versioned database migration history
├── public/                            # Static assets and icons
├── scripts/
│   └── seed-admin.ts                  # Secure CLI utility for provisioning & verifying Super Admins
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/                 # Owner & staff authentication page
│   │   │   └── register/              # Self-service restaurant owner registration
│   │   ├── (dashboard)/
│   │   │   ├── admin/                 # Super Admin dashboard (Approvals, billing, system UPI config)
│   │   │   ├── dashboard/             # Owner multi-restaurant switcher & high-level stats
│   │   │   └── restaurants/
│   │   │       ├── new/               # New restaurant setup wizard
│   │   │       └── [id]/              # Restaurant management portal
│   │   │           ├── analytics/     # Revenue, order volume, and top item metrics
│   │   │           ├── coupons/       # Promo codes & discount limit configuration
│   │   │           ├── menu/          # Category & item management with custom tax rates
│   │   │           ├── orders/        # Live kitchen order management pipeline
│   │   │           ├── service-requests/ # Waiter call & diner request alert feed
│   │   │           ├── settings/      # GST, branding, profile, and Google Review links
│   │   │           ├── subscription/  # Plan status, table quota, and offline payment submission
│   │   │           └── tables/        # Table layout, statuses, and QR code printable export
│   │   ├── admin/login/               # Dedicated Super Admin sign-in portal
│   │   ├── api/
│   │   │   ├── admin/                 # Super Admin APIs (Approvals, suspensions, payment approvals, configs)
│   │   │   ├── auth/                  # Authentication endpoints (login, register, logout, session check)
│   │   │   ├── health/                # System liveness & database readiness probes
│   │   │   ├── r/[slug]/              # Public diner APIs (Menu fetch, order submit, service call, receipts)
│   │   │   └── restaurants/           # Multi-tenant CRUD (Menu, tables, orders, coupons, settings, analytics)
│   │   ├── globals.css                # Tailwind CSS v4 styling & glassmorphism system
│   │   ├── layout.tsx                 # Root layout with fonts & notification providers
│   │   ├── page.tsx                   # High-conversion landing page
│   │   └── r/[slug]/                  # Public customer QR ordering view & digital receipt lookup
│   ├── components/
│   │   ├── admin/                     # Approvals table, rejection modals, payment verification
│   │   ├── analytics/                 # KPI cards, revenue charts, order breakdown tables
│   │   ├── coupons/                   # Coupon cards, create/edit modals, usage indicators
│   │   ├── dashboard/                 # Header, navigation drawer, restaurant cards
│   │   ├── menu/                      # Menu item cards, category filters, custom tax editor
│   │   ├── orders/                    # Live kitchen order boards, status buttons, print slips
│   │   ├── service-requests/          # Real-time waiter alert monitors
│   │   ├── subscription/              # Plan pricing matrix, table counter, offline payment modal
│   │   ├── tables/                    # Table grid, QR modal generator, print preview
│   │   └── ui/                        # Badges, modals, toasts, tooltips, glass cards
│   ├── context/                       # Global React contexts (Notifications, active restaurant)
│   ├── lib/
│   │   ├── analytics/                 # Aggregation pipelines for revenue & popular items
│   │   ├── auth/                      # Password hashing (bcrypt) and JWT session lifecycle (jose)
│   │   ├── coupons/                   # Coupon validation engine and usage limit calculator
│   │   ├── db/                        # Prisma ORM singleton client
│   │   ├── notifications/             # Polling & notification dispatch handlers
│   │   ├── orders/                    # Order state machines, order numbering, receipt generators
│   │   ├── qr/                        # QR generation, token signing & validation
│   │   ├── security/                  # Multi-tenant isolation guards & domain rule gates
│   │   ├── storage/                   # Media upload driver (Local filesystem with S3/R2 pluggability)
│   │   ├── subscription/              # Table limit verification and subscription state evaluator
│   │   └── validations/               # Zod validation schemas for all inputs
│   ├── middleware.ts                  # Edge route protection, session extraction & role-based routing
│   └── types/                         # Shared TypeScript interfaces and domain enums
├── tests/                             # 30 Vitest suites verifying domain rules, security & calculations
├── .env.example                       # Environment variable template
├── package.json                       # Dependencies & scripts
├── tsconfig.json                      # Strict TypeScript compiler options
└── vitest.config.ts                   # Vitest configuration
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js:** `>= 20.18.0`
- **npm:** `>= 10.8.2`
- **PostgreSQL:** Local PostgreSQL or hosted instances (Neon, Supabase, AWS RDS, Docker)

### 2. Installation & Environment Configuration
Clone the repository and install dependencies:
```bash
git clone https://github.com/your-username/qrserve.git
cd qrserve
npm install
```

Copy the environment template:
```bash
cp .env.example .env
```

Open `.env` and fill in your configuration:
```env
# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://username:password@localhost:5432/qrserve?schema=public"

# Session Security (Generate with: openssl rand -base64 32)
JWT_SECRET="replace_with_a_secure_random_32_byte_secret"
COOKIE_NAME="qrserve_session"

# Application URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

# Designated Super Admin (Server-side lockdown)
SUPER_ADMIN_EMAIL="admin@qrserve.com"
```

### 3. Database Initialization
Generate the Prisma Client and push the schema to your database:
```bash
# Push schema directly to database
npx prisma db push

# (Optional) Launch Prisma Studio to inspect records visually
npx prisma studio
```

### 4. Provision Initial Super Admin
Public registration only creates `RESTAURANT_OWNER` accounts. Super Admin accounts are provisioned securely via CLI:
```bash
# Provision or promote an account to Super Admin:
npm run seed:admin -- --name="Super Admin" --email="admin@qrserve.com" --password="YourSecurePassword123!"

# Inspect Super Admin status without making changes:
npm run seed:admin -- --email="admin@qrserve.com" --check
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔒 Security & Multi-Tenant Governance

```
                    ┌────────────────────────┐
                    │    Incoming Request    │
                    └───────────┬────────────┘
                                │
                                ▼
                     [ Next.js Middleware ]
                                │
        ┌───────────────────────┴──────────────────────┐
        │                                              │
        ▼                                              ▼
 [ Public Customer Routes ]                   [ Protected Dashboards ]
 - Verify restaurant approval                 - Validate signed JWT cookie
 - Check active & not suspended               - Enforce role (SUPER_ADMIN / OWNER)
 - Verify signed table QR token               - Verify RestaurantMember ownership
```

1. **Strict Multi-Tenant Isolation:**
   - Every restaurant query is gated through `assertRestaurantAccess` or scoped via `RestaurantMember` relations.
   - Owners cannot access, modify, or inspect menus, orders, tables, or analytics of another restaurant.
2. **Tamper-Proof Session Management:**
   - Stateless signed JWTs using `jose` with `HS256` symmetric signing.
   - Stored in `HttpOnly; Secure; SameSite=Lax` cookies to prevent XSS access.
3. **Role Elevation Prevention:**
   - Public registration endpoints strictly hardcode role to `RESTAURANT_OWNER`.
   - Super Admin accounts can only be created via server-side CLI seeding (`scripts/seed-admin.ts`) and verified against `SUPER_ADMIN_EMAIL`.
4. **Table QR Cryptographic Integrity:**
   - Table QR tokens can be signed and verified to prevent patrons from spoofing table identifiers.
5. **Separation of Approval & Activation:**
   - Restaurant owners cannot self-approve their establishments.
   - Super Admins have emergency suspension powers that instantly close public ordering without deleting tenant data.

---

## 🧪 Testing & Verification

The codebase includes **30 Vitest suites with 327 tests** covering domain calculations, security barriers, and business rules:

```bash
# Run full test suite
npm test

# Run tests in watch mode
npx vitest

# Run a specific test suite
npx vitest tests/tax_gst_calculation.test.ts
npx vitest tests/security_tenant.test.ts
npx vitest tests/coupon_system.test.ts

# Run strict TypeScript typechecking
npx tsc --noEmit

# Run ESLint
npm run lint

# Build production bundle
npm run build
```

### Test Coverage Highlights:
- **`tax_gst_calculation.test.ts`**: Verifies inclusive and exclusive GST modes, item-level overrides, and CGST/SGST round-off precision.
- **`coupon_system.test.ts`**: Tests percentage vs. flat discounts, minimum subtotal thresholds, maximum caps, expired dates, and per-user limits.
- **`security_tenant.test.ts`**: Verifies cross-tenant isolation and unauthorized access denial.
- **`subscription_*.test.ts`**: Tests plan table quotas, payment proof workflows, and feature limit enforcement.
- **`kitchen_order_management.test.ts`**: Verifies order status lifecycle transitions and idempotent placements.
- **`waiter_service_requests.test.ts`**: Verifies diner service requests lifecycle and table mappings.

---

## 📡 API Reference Overview

### 🔐 Authentication (`/api/auth`)
- `POST /api/auth/register` — Register a new restaurant owner account.
- `POST /api/auth/login` — Authenticate and receive HttpOnly session cookie.
- `POST /api/auth/logout` — Invalidate session and clear cookie.
- `GET /api/auth/me` — Retrieve active session user profile.

### 🏢 Restaurant Management (`/api/restaurants`)
- `GET /api/restaurants` — List restaurants owned by current user.
- `POST /api/restaurants` — Create a new restaurant (`PENDING` approval).
- `GET /api/restaurants/[id]` — Fetch restaurant details and settings.
- `PATCH /api/restaurants/[id]` — Update profile, GST settings, and branding.
- `PATCH /api/restaurants/[id]/toggle-active` — Owner toggle for active ordering state.
- `GET /api/restaurants/[id]/menu` — Fetch categories and menu items.
- `POST /api/restaurants/[id]/menu/items` — Create a menu item with custom tax rate.
- `GET /api/restaurants/[id]/tables` — List tables and generate QR codes.
- `POST /api/restaurants/[id]/tables` — Create a table (enforces plan table quota).
- `GET /api/restaurants/[id]/orders` — Live kitchen order feed with status filtering.
- `PATCH /api/restaurants/[id]/orders/[orderId]` — Update order status.
- `GET /api/restaurants/[id]/coupons` — List promo coupons and usage analytics.
- `POST /api/restaurants/[id]/coupons` — Create promotional coupon.
- `GET /api/restaurants/[id]/service-requests` — Live waiter call feed.
- `GET /api/restaurants/[id]/analytics` — Sales summary and top-selling items.
- `POST /api/restaurants/[id]/subscription/pay` — Submit offline UPI/Bank payment request.

### 🍽️ Public Dine-In Ordering (`/api/r/[slug]`)
- `GET /api/r/[slug]` — Fetch public menu (enforces Approval, Active, and Non-Suspended status).
- `POST /api/r/[slug]/orders` — Submit counter-pay diner order with coupon code and table token.
- `GET /api/r/[slug]/orders/[orderId]` — Fetch customer digital receipt and real-time status.
- `POST /api/r/[slug]/service-requests` — Submit table waiter service request.

### 👑 Super Admin Governance (`/api/admin`)
- `GET /api/admin/restaurants` — List all platform restaurants with approval/suspension status.
- `PATCH /api/admin/restaurants/[id]/approval` — Approve or reject restaurant registration.
- `PATCH /api/admin/restaurants/[id]/suspension` — Toggle platform emergency suspension.
- `GET /api/admin/subscriptions/requests` — Review pending offline UPI/Bank payment requests.
- `PATCH /api/admin/subscriptions/requests/[requestId]` — Approve or reject payment requests.
- `GET/PUT /api/admin/payment-config` — Manage platform UPI ID, QR payee, and bank details.

---

## 📜 Production Deployment Checklist

1. **Environment Variables:**
   - Set a strong, randomly generated `JWT_SECRET` (minimum 32 bytes).
   - Set `NEXT_PUBLIC_APP_URL` to your production domain (e.g., `https://qrserve.com`).
   - Configure a production-grade managed PostgreSQL connection with SSL enabled (`sslmode=require`).
   - Specify `SUPER_ADMIN_EMAIL` to lock down Super Admin access.
2. **Database Migrations:**
   - Run `npx prisma migrate deploy` in your CI/CD pipeline before launching the application.
3. **Provision Super Admin:**
   - Execute `npm run seed:admin` once on the production database to set up the administrative user.
4. **Media Storage:**
   - Mount a persistent volume at `STORAGE_DIR` or configure cloud storage credentials for production media assets.
5. **Build Optimization:**
   - Run `npm run build` to verify ahead-of-time compilation and route optimization.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

# qrserve

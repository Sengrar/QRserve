import React from "react";
import Link from "next/link";
import {
  QrCode,
  ShieldAlert,
  ArrowLeft,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Scale,
  CreditCard,
  Building2,
  Lock,
  Globe2,
  History,
  FileCheck2,
} from "lucide-react";

export const metadata = {
  title: "Terms & Conditions — QRServe",
  description:
    "Official Terms and Conditions for restaurant owners using the QRServe QR-based menu and table-order management system.",
};

export default function TermsAndConditionsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500/20 selection:text-amber-300">
      {/* Top Header */}
      <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <QrCode className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <span className="text-xl font-black tracking-tight bg-gradient-to-r from-amber-300 via-orange-300 to-amber-400 bg-clip-text text-transparent">
              QRServe
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition shadow-lg shadow-amber-500/20"
            >
              Register Restaurant
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Hero Banner */}
          <div className="relative mb-10 pb-8 border-b border-slate-800/80">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-300 mb-4">
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span>Legal Agreement & Operating Rules</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
              QRServe — Terms & Conditions
            </h1>
            <p className="text-base text-slate-300 leading-relaxed max-w-3xl">
              By registering for or using QRServe, the restaurant owner (“Restaurant”) agrees to the following Terms & Conditions.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                Version 1.0 (Official)
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                Applicable to all registered restaurants
              </span>
            </div>
          </div>

          {/* Quick Jump Index */}
          <div className="mb-10 p-5 rounded-2xl glass-card border border-slate-800/90">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-amber-400" />
              Document Sections
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <a href="#section-1" className="text-slate-300 hover:text-amber-300 transition py-1">1. QRServe Service</a>
              <a href="#section-2" className="text-slate-300 hover:text-amber-300 transition py-1">2. Restaurant Owner's Responsibility</a>
              <a href="#section-3" className="text-slate-300 hover:text-amber-300 transition py-1 font-semibold text-amber-400">3. Payments & Financial Responsibility</a>
              <a href="#section-4" className="text-slate-300 hover:text-amber-300 transition py-1">4. Bills, Orders, and Taxes</a>
              <a href="#section-5" className="text-slate-300 hover:text-amber-300 transition py-1">5. Subscription and Fees</a>
              <a href="#section-6" className="text-slate-300 hover:text-amber-300 transition py-1">6. Account Security & Use</a>
              <a href="#section-7" className="text-slate-300 hover:text-amber-300 transition py-1">7. Service Availability</a>
              <a href="#section-8" className="text-slate-300 hover:text-amber-300 transition py-1">8. Limitation of Liability</a>
              <a href="#section-9" className="text-slate-300 hover:text-amber-300 transition py-1">9. Misuse and Suspension</a>
              <a href="#section-10" className="text-slate-300 hover:text-amber-300 transition py-1">10. Privacy & Customer Info</a>
              <a href="#section-11" className="text-slate-300 hover:text-amber-300 transition py-1">11. Changes to These Terms</a>
              <a href="#section-12" className="text-slate-300 hover:text-amber-300 transition py-1 font-semibold text-amber-400">12. Acceptance</a>
            </div>
          </div>

          {/* Clauses List */}
          <div className="space-y-8 text-sm text-slate-300 leading-relaxed">
            {/* Section 1 */}
            <section id="section-1" className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                  1
                </span>
                <h2 className="text-lg font-bold text-white tracking-tight">QRServe Service</h2>
              </div>
              <p className="text-slate-300">
                QRServe provides a QR-based restaurant menu and table-order management system. Customers can scan a table QR code, browse the menu, and place orders. QRServe may provide order management, kitchen tickets, combined table bills, and payment-status management features.
              </p>
            </section>

            {/* Section 2 */}
            <section id="section-2" className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                  2
                </span>
                <h2 className="text-lg font-bold text-white tracking-tight">Restaurant Owner's Responsibility</h2>
              </div>
              <p className="mb-3 text-slate-300">The Restaurant is solely responsible for:</p>
              <ul className="space-y-2 pl-4 list-disc marker:text-amber-400 text-slate-300">
                <li>The accuracy of its menu, item descriptions, prices, taxes, discounts, and availability.</li>
                <li>Preparing and serving food and maintaining food quality, hygiene, and food-safety compliance.</li>
                <li>Confirming customer orders, handling cancellations, refunds, complaints, and service disputes.</li>
                <li>Ensuring that staff members use the system correctly.</li>
                <li>Maintaining the accuracy of bills and applicable taxes.</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section id="section-3" className="glass-card rounded-2xl p-6 sm:p-7 border border-amber-500/30 bg-gradient-to-b from-amber-500/[0.04] to-transparent">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center">
                  3
                </span>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-white tracking-tight">Payments and Financial Responsibility</h2>
                </div>
              </div>
              <ul className="space-y-3 pl-4 list-disc marker:text-amber-400 text-slate-300">
                <li>
                  QRServe does not receive, hold, transfer, or settle restaurant payments unless a specific payment service is separately introduced and expressly agreed upon.
                </li>
                <li>
                  Customers must pay the Restaurant directly using the payment methods accepted by that Restaurant.
                </li>
                <li>
                  The Restaurant is responsible for verifying whether payment has actually been received before marking an order or bill as PAID.
                </li>
                <li>
                  QRServe is not responsible for cash shortages, failed or delayed bank/UPI transactions, incorrect payment confirmations, chargebacks, refunds, fraud, payment disputes, or losses arising from transactions between the Restaurant and its customers or payment providers, except to the extent caused by QRServe's own legally attributable acts or omissions.
                </li>
                <li>
                  The Restaurant is responsible for its own bank, UPI, payment-provider, tax, and other applicable transaction charges.
                </li>
              </ul>

              {/* Callout: Strict non-handling disclaimer */}
              <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs sm:text-sm flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">
                    Important Financial Notice:
                  </p>
                  <p>
                    <strong>QRServe is not responsible for collecting, paying, reimbursing, or settling money owed by a customer to a Restaurant, or money owed by a Restaurant to a customer or third party.</strong> Such financial obligations remain with the relevant parties.
                  </p>
                  <p className="pt-1 font-medium text-amber-400">
                    The Restaurant must not mark a bill as PAID until payment has been verified.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section id="section-4" className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                  4
                </span>
                <h2 className="text-lg font-bold text-white tracking-tight">Bills, Orders, and Taxes</h2>
              </div>
              <p className="text-slate-300">
                The Restaurant is responsible for checking order details, final bills, applicable GST or other taxes, and the correctness of any payment confirmation. QRServe provides software tools to assist with these activities but does not replace the Restaurant's own accounting or legal obligations.
              </p>
            </section>

            {/* Section 5 */}
            <section id="section-5" className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                  5
                </span>
                <h2 className="text-lg font-bold text-white tracking-tight">Subscription and Fees</h2>
              </div>
              <p className="text-slate-300">
                Any QRServe subscription fee, allowed table limit, billing period, renewal condition, or additional charge will be communicated to the Restaurant before it becomes applicable. Failure to pay an agreed subscription fee may result in suspension or restriction of the service after appropriate notice, subject to applicable law and the agreed subscription terms.
              </p>
            </section>

            {/* Section 6 */}
            <section id="section-6" className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                  6
                </span>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <h2 className="text-lg font-bold text-white tracking-tight">Account Security and Authorized Use</h2>
                </div>
              </div>
              <p className="text-slate-300">
                The Restaurant must keep its login credentials secure, restrict access to authorized staff, and promptly report suspected unauthorized access. The Restaurant is responsible for activity performed through its account, except where applicable law provides otherwise.
              </p>
            </section>

            {/* Section 7 */}
            <section id="section-7" className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                  7
                </span>
                <div className="flex items-center gap-2">
                  <Globe2 className="w-4 h-4 text-amber-400" />
                  <h2 className="text-lg font-bold text-white tracking-tight">Service Availability and Technical Issues</h2>
                </div>
              </div>
              <p className="text-slate-300 mb-2">
                QRServe will make reasonable efforts to keep the service available. However, temporary interruptions, internet failures, device problems, third-party outages, maintenance, or unforeseen technical issues may affect availability. QRServe does not guarantee uninterrupted or error-free operation.
              </p>
              <p className="text-slate-400 text-xs italic">
                The Restaurant should independently verify important orders, bills, and payments when technical issues occur.
              </p>
            </section>

            {/* Section 8 */}
            <section id="section-8" className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                  8
                </span>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <h2 className="text-lg font-bold text-white tracking-tight">Limitation of Liability</h2>
                </div>
              </div>
              <p className="text-slate-300 mb-3">
                To the extent permitted by applicable law, QRServe will not be liable for indirect or consequential losses, loss of profits, business interruption, or losses caused by inaccurate information supplied by the Restaurant, customer conduct, third-party payment providers, or failures outside QRServe's reasonable control.
              </p>
              <p className="text-slate-300">
                Nothing in these Terms excludes or limits liability that cannot legally be excluded or limited, including liability arising from fraud, willful misconduct, or other matters where applicable law prohibits such limitation.
              </p>
            </section>

            {/* Section 9 */}
            <section id="section-9" className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                  9
                </span>
                <h2 className="text-lg font-bold text-white tracking-tight">Misuse and Suspension</h2>
              </div>
              <p className="text-slate-300">
                QRServe may restrict or suspend access for suspected fraud, unlawful activity, security risks, misuse, or material violation of these Terms. Where reasonably possible, the Restaurant will be notified and given an opportunity to address the issue, subject to urgent security or legal requirements.
              </p>
            </section>

            {/* Section 10 */}
            <section id="section-10" className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                  10
                </span>
                <h2 className="text-lg font-bold text-white tracking-tight">Privacy and Customer Information</h2>
              </div>
              <p className="text-slate-300">
                The Restaurant must use customer information only for legitimate order processing and other purposes permitted by applicable law. Both QRServe and the Restaurant must comply with applicable privacy and data-protection requirements relevant to their respective activities.
              </p>
            </section>

            {/* Section 11 */}
            <section id="section-11" className="glass-card rounded-2xl p-6 sm:p-7 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                  11
                </span>
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-400" />
                  <h2 className="text-lg font-bold text-white tracking-tight">Changes to These Terms</h2>
                </div>
              </div>
              <p className="text-slate-300">
                QRServe may update these Terms when necessary. Material changes will be communicated through a reasonable notice method. Continued use after the effective date of an update constitutes acceptance only to the extent permitted by applicable law.
              </p>
            </section>

            {/* Section 12 */}
            <section id="section-12" className="glass-card rounded-2xl p-6 sm:p-8 border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-slate-900/90 to-orange-500/5 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs flex items-center justify-center shadow-lg shadow-amber-500/20">
                  12
                </span>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-amber-400" />
                  <h2 className="text-xl font-bold text-white tracking-tight">Acceptance</h2>
                </div>
              </div>
              <p className="text-slate-200 text-base font-medium mb-4">
                By checking the acceptance box and submitting the registration or activation request, the Restaurant confirms that it has read, understood, and agreed to these Terms & Conditions.
              </p>
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs sm:text-sm text-slate-300">
                <p>
                  <strong className="text-white">Important:</strong> These Terms do not remove any rights or obligations that cannot legally be waived. The Restaurant remains responsible for its own business operations and its direct financial transactions with customers and third parties.
                </p>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-xs text-slate-400">
                  Ready to proceed with your restaurant registration?
                </span>
                <Link
                  href="/register"
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition shadow-lg shadow-amber-500/20 text-center"
                >
                  Return to Registration & Accept
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8 px-4 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>QRServe Multi-Tenant Digital QR Platform • Terms & Conditions</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-slate-300 transition">
              Home
            </Link>
            <Link href="/login" className="hover:text-slate-300 transition">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-slate-300 transition">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

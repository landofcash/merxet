import {Card, CardContent, CardFooter} from "@/components/ui/card.tsx";
import {Presentation, ShoppingCart, Store, Youtube} from "lucide-react";

export default function AboutPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 text-neutral-800 space-y-10">
      <Card
        className="h-full flex items-center justify-center bg-gradient-to-br from-neutral-50 to-white text-neutral-900 shadow-2xl">
        <CardContent className="w-full h-full flex flex-col px-12 space-y-6">
          <div className="flex flex-col items-center justify-center text-center">
            <img src="/logo-t-g-128x128.png" alt="Aptoosh logo" className="w-20 h-20 mb-2"/>
            <h1 className="text-5xl font-bold tracking-tight drop-shadow-sm mb-3 ">Aptoosh </h1>
            <p className="text-base sm:text-2xl  max-w-md text-fuchsia-700">
              Scan. Shop. Pay in a flash. </p>
          </div>
          <blockquote className="text-center text-lg text-neutral-600 italic">
            A point-of-sale experience without traditional hardware, apps, or merchant accounts.
          </blockquote>

          <section>
            <h2 className="text-2xl font-semibold mb-2">✨ Think of Aptoosh as:</h2>
            <blockquote className="border-l-4 border-neutral-400 pl-4 text-neutral-600 font-medium italic mb-2">
              “QR-native e-commerce — scan, pay, walk away.”
            </blockquote>
            <p>
              You don’t need a seller terminal. You don’t need a cashier. You don’t even need a website — just a QR code
              or link that launches the checkout flow. </p>
          </section>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-4">
            <a href="https://aptoosh.b-cdn.net/Aptoosh-by-Aptos-Presentation.pdf" target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded shadow transition-colors">
              <Presentation className="w-4 h-4"/>
              See Presentation
            </a>
            <a href="https://www.youtube.com/watch?v=kYJUAD2yZUw" target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded shadow transition-colors">
              <Youtube className="w-4 h-4"/> Watch Video
            </a>
            <a href="/" target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded shadow transition-colors">
              <ShoppingCart className="w-4 h-4"/> Demo catalogue
            </a>
            <a href="https://s.aptoosh.com" target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded shadow transition-colors">
              <Store className="w-4 h-4"/> Explore Seller Portal
            </a>
          </div>
          <section>
            <h2 className="text-2xl font-semibold mb-2">🛍️ Core Concept</h2>
            <p className="mb-4">
              A <strong>POS-like experience</strong> (but without terminals, banks, or subscriptions) where physical or
              digital products can be purchased instantly. </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Combines <strong>QR scanning</strong> with <strong>Aptos smart contract payments</strong></li>
              <li>Supports <strong>optional credit card checkout</strong></li>
              <li>Designed to make <strong>crypto payments feel as fast and intuitive as Apple Pay or Google
                Pay</strong></li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-2">🔐 Security & Cryptography</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Delivery address and order list are <strong>encrypted on the client</strong> before being stored
                on-chain.
              </li>
              <li>Uses <strong>asymmetric key encryption</strong> derived from a buyer signature.</li>
              <li><strong>No servers, no databases, no logins</strong> — just a client-side app + the <strong>Aptos
                blockchain</strong>.
              </li>
              <li>Smart contracts <strong>enforce order lifecycle and payment rules</strong>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-2">🎯 Use Cases</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Merchants selling <strong>physical or digital goods</strong></li>
              <li><strong>Pop-up stores</strong> or local marketplaces</li>
              <li><strong>Restaurants</strong> or <strong>takeaways</strong> accepting crypto</li>
              <li><strong>Events</strong> where users scan QR codes to pay for entry or items</li>
              <li>Printed or digital <strong>promo materials</strong> with instant “Add to Cart” and checkout</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-2">✅ What Aptoosh Is</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>A <strong>self-service, trustless, on-chain checkout experience</strong></li>
              <li>Just <strong>scan a QR</strong>, pay, and walk away</li>
              <li><strong>No registration</strong>, no merchant hardware, no backend infrastructure needed</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-2">🛒 Are You a Seller?</h2>
            <p className="mb-2">
              Explore the Aptoosh Seller Platform and start offering instant checkout with just a QR code: </p>
            <a href="https://s.aptoosh.com" className="text-blue-900 hover:text-blue-600 underline" target="_blank">Visit
              Seller Portal</a>
          </section>
        </CardContent>
        <CardFooter className="justify-center text-xs text-muted-foreground py-1">
          © {new Date().getFullYear()} APTOOSH.COM.
        </CardFooter>
      </Card>
    </main>
  );
}

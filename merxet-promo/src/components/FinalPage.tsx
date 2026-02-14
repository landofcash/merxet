// src/components/FinalPage.tsx
import {Card, CardContent} from "@/components/ui/card";
import {Youtube, Store} from "lucide-react";

export default function FinalPage() {
  return (
    <Card
      className="h-full flex items-center justify-center bg-gradient-to-tl from-neutral-100 to-white text-neutral-900 shadow-inner border border-neutral-100">
      <CardContent className="flex flex-col items-center justify-center text-center px-12 space-y-6">
        <h2 className="text-4xl font-semibold tracking-tight text-slate-900">
          Thank You for Trying Aptoosh! </h2>
        <div className="text-base text-slate-700 max-w-md leading-relaxed space-y-4">
          <p>
            We hope you enjoyed using the Aptoosh app and experienced just how easy and fast shopping can be. </p>
          <div className="text-left space-y-2">
            <div className="inline-flex items-center gap-2 font-medium text-slate-800">
              <Youtube className="w-4 h-4"/>
              Learn More
            </div>
            <p className="text-sm">
              A quick overview of the story behind the product and how it works:
              <br/>
              <a href="https://www.youtube.com/watch?v=kYJUAD2yZUw" target="_blank"
                 className="text-blue-700 hover:text-blue-600 underline font-bold">Watch Video</a>
            </p>
            <p className="text-sm">
              The full concept description in detail:
              <br/>
              <a href="https://aptoosh.b-cdn.net/Aptoosh-by-Aptos-Presentation.pdf" target="_blank"
                 className="text-blue-700 hover:text-blue-600 underline font-bold">See Project Presentation</a>
            </p>
            <p className="text-sm">
              For more project details:
              <br/>
              <a href="/about" target="_blank"
                 className="text-blue-700 hover:text-blue-600 underline font-bold">View About</a>
            </p>
          </div>
          <div className="text-left space-y-2">
            <div className="inline-flex items-center gap-2 font-medium text-slate-800">
              <Store className="w-4 h-4"/>
              Are You a Seller?
            </div>
            <p className="text-sm">
              Start offering instant checkout with just a QR code:
              <br/>
              <a href="https://s.aptoosh.com" target="_blank"
                 className="text-blue-700 hover:text-blue-600 underline font-bold">Explore Aptoosh Seller Portal</a>
            </p>
          </div>
          <p className="pt-4 text-center font-medium text-slate-800">
            <span className="text-fuchsia-700">Scan it. Shop it. Pay in a flash.</span>
            <br/>
            <span className="text-slate-900 text-lg font-semibold">Aptoosh.</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

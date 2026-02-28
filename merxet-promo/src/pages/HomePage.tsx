import HTMLFlipBook from 'react-pageflip'
import {useEffect, useState} from "react";
import {useLocation, useParams} from 'react-router-dom';
import CoverPage from '@/components/CoverPage';
import ProductPage from "@/components/ProductPage.tsx";
import FinalPage from '@/components/FinalPage';
import {type Product, ProductCatalogueSchema} from "@/lib/productSchemas.ts";
import {getCurrentConfig} from '@/config.ts';
import {getAptosClient} from "@/lib/aptos/aptosClient.ts";

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogueSeed, setCatalogueSeed] = useState<string>('');
  const [shopWallet, setShopWallet] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const location = useLocation();
  const params = useParams();

  // Helper: call Aptos view to fetch the Product
  const getProductFromChain = async (seed: string) => {
    const cfg = getCurrentConfig();
    const aptos = getAptosClient();
    const result = await aptos.view({
      payload: {
        function: `${cfg.account}::products::get_product`,
        typeArguments: [],
        functionArguments: [seed], // vector<u8>
      },
    });

    // get_product returns option::Option<Product>.
    // On REST/ts-sdk JSON, Option<T> is represented as { vec: [] } for None or { vec: [T] } for Some(T)
    const opt = result?.[0] as any;
    if (!opt || !('vec' in opt)) {
      throw new Error('Unexpected response from Aptos view function');
    }
    const hasValue = Array.isArray(opt.vec) && opt.vec.length > 0;
    if (!hasValue) return null;

    // Product shape from Move:
    // { version: number, shop: string (hex addr), seller_pubkey: string|hex|bytes, products_url: string }
    return opt.vec[0] as { products_url: string; shop: string };
  };

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const loadCatalogue = async () => {
      try {
        setLoading(true);
        setError(null);

        // Extract seed from URL - first try path parameter, then query parameter
        const pathSeed = params.seed as string | undefined;
        const searchParams = new URLSearchParams(location.search);
        const querySeed = searchParams.get('seed') || undefined;
        const seedParam = pathSeed || querySeed || "Lr_bx92gSbCqEzaMWgZGag"; // default sample seed

        setCatalogueSeed(seedParam);

        // NEW: Fetch Product from Aptos instead of Aptos box
        const onchainProduct = await getProductFromChain(seedParam);
        if (!onchainProduct) {
          throw new Error('Catalogue not found for the provided seed');
        }

        setShopWallet(onchainProduct.shop);

        // Load the JSON catalogue pointed by products_url
        const response = await fetch(onchainProduct.products_url);
        if (!response.ok) {
          throw new Error(`Failed to fetch catalogue: ${response.status}`);
        }
        const data = await response.json();
        const parsedProducts = ProductCatalogueSchema.parse(data);
        setProducts(parsedProducts);
      } catch (err) {
        console.error('Error loading catalogue:', err);
        setError(err instanceof Error ? err.message : 'Failed to load catalogue');
      } finally {
        setLoading(false);
      }
    };

    loadCatalogue();
  }, [location.search, params.seed]);

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4 py-6">
        <div className="text-center py-20 text-muted-foreground text-lg">
          Loading catalogue...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4 py-6">
        <div className="text-center py-20 text-red-600 text-lg max-w-md">
          <h2 className="text-xl font-semibold mb-2">Error Loading Catalogue</h2>
          <p className="text-sm">{error}</p>
          <div className="text-xs text-gray-500 mt-4 space-y-1">
            <p>Try using one of these URL formats:</p>
            <p>• Path: /your-seed-here</p>
            <p>• Query: ?seed=your-seed-here</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-screen px-4 py-6">
      <div key="header" className="h-full overflow-hidden drop-shadow-[0_20px_60px_rgba(0,0,0,0.35)] w-full max-w-[1200px]">
        {products.length > 0 ? (
          <HTMLFlipBook
            width={isMobile ? 320 : 600}
            height={isMobile ? 700 : 600}
            size="fixed"
            minWidth={315}
            maxWidth={1000}
            minHeight={400}
            maxHeight={700}
            maxShadowOpacity={0.5}
            showCover={false}
            drawShadow={true}
            mobileScrollSupport={true}
            usePortrait={isMobile}
            className="w-[90vw] h-[80vh] max-w-[1000px] max-h-[700px]"
          >
            <div key="cover" className="w-full h-full">
              <CoverPage key="cover" shopWallet={shopWallet} />
            </div>
            {products.map((p, i) => (
              <div key={i} className="w-full h-full">
                <ProductPage
                  catalogueSeed={catalogueSeed}
                  key={`p${i}`}
                  product={p}
                  pageNumber={i + 1}
                  shopWallet={shopWallet}
                />
              </div>
            ))}
            <div key="footer" className="w-full h-full">
              <FinalPage key="final" />
            </div>
          </HTMLFlipBook>
        ) : (
          <div className="text-center py-20 text-muted-foreground text-lg">
            No products found in this catalogue.
          </div>
        )}
      </div>
    </main>
  );
}

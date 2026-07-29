import type {NetworkId} from "@/context/wallet/types.ts";
import type {Product} from "@/lib/productSchemas.ts";

export function createCatalogStructuredData(
  catalogSeed: string,
  network: NetworkId,
  products: Product[],
  catalogPageUrl: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Merxet Promo Catalogue",
    url: catalogPageUrl,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: product.Name,
        description: product.Description,
        image: product.Image,
        sku: product.ProductId,
        additionalProperty: [
          {
            "@type": "PropertyValue",
            name: "Merxet catalog seed",
            value: catalogSeed,
          },
          {
            "@type": "PropertyValue",
            name: "Merxet network",
            value: network,
          },
          {
            "@type": "PropertyValue",
            name: "Merxet price token",
            value: product.PriceToken,
          },
          {
            "@type": "PropertyValue",
            name: "Merxet price in base units",
            value: product.Price.toString(),
          },
        ],
      },
    })),
  };
}

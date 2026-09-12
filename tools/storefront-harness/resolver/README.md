# Public storefront resolver

The resolver serves published storefront revisions from Bunny storage. It is a read-only Node.js service shared by multiple shops.

## Routes

Each shop is rooted at /s/:shopId/. Supported storefront routes include:

- the shop root;
- products and product details;
- collections;
- the about page.

The process accepts GET and HEAD requests and exposes /healthz. Unknown assets return not found rather than storefront HTML.

## Storage and caching

The resolver reads the current revision and completed metadata through the authenticated primary storage endpoint. It fetches compiled files from the public CDN and verifies their size and SHA256 hash before serving them.

HTML and storefront configuration use no-store. Static assets are immutable within a shop and use long-lived browser caching. If asset bytes change, publication must use a new filename.

## Configuration

The service receives only:

    BUNNY_PUBLIC_STORAGE_ENDPOINT
    BUNNY_PUBLIC_STORAGE_ZONE
    BUNNY_PUBLIC_STORAGE_KEY
    BUNNY_PUBLIC_BASE_URL
    PORT

Use a read-only public-zone credential when available. The resolver has no private storage, model, seller wallet, or Railway sandbox credentials and performs no storage writes.

## Run and deploy

    cmd /c npm start

The deployment bundle is restricted to the resolver package, Docker/Railway configuration, and source files. Run the parent harness type checking and tests before deployment.

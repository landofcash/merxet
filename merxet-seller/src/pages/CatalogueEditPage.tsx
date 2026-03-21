import {useState, useRef, type DragEvent, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardHeader, CardTitle, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {toast} from 'sonner';
import {CRYPTO_NAME, CRYPTO_NAME_BLOCKCHAIN, getCurrentConfig, type TokenConfig} from '@/config';
import {encodeBase64Uuid} from '@/lib/uuidUtils';
import {useNavigate, Link} from "react-router-dom";
import {
  Plus,
  Upload,
  Edit,
  Trash2,
  Info,
  ExternalLink,
  Cloud,
  Server,
  ArrowRight,
  CheckCircle,
  FileImage
} from 'lucide-react';
import {formatMicroToFull} from '@/lib/cryptoFormat';
import {useWallet} from "@/context/WalletContext.tsx";

interface Product {
  ProductId: string;
  Name: string;
  Description: string;
  Price: number;
  PriceToken: string;
  Image: string;
  LocalFile?: File;
}

// Character limits
const NAME_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 320;
const HEIC_EXTENSIONS = new Set(['heic', 'heif']);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif']);

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function isHeicFile(file?: File): boolean {
  if (!file) {
    return false;
  }

  const mimeType = file.type.toLowerCase();
  return HEIC_EXTENSIONS.has(getFileExtension(file.name))
    || mimeType === 'image/heic'
    || mimeType === 'image/heif'
    || mimeType === 'image/heic-sequence'
    || mimeType === 'image/heif-sequence';
}

function isSupportedImageFile(file: File): boolean {
  return file.type.toLowerCase().startsWith('image/')
    || SUPPORTED_IMAGE_EXTENSIONS.has(getFileExtension(file.name));
}

type EditableProduct = {
  Name: string;
  Description: string;
  Price: string;       // full-unit price
  PriceToken: string;
  LocalFile?: File;
};

function toEditableProduct(product: Product, tokens: TokenConfig[]): EditableProduct {
  const token = tokens.find(t => t.tokenId === product.PriceToken);
  const decimals = token?.decimals ?? 0;
  return {
    Name: product.Name,
    Description: product.Description,
    Price: (product.Price / 10 ** decimals).toString(),  // micro → full
    PriceToken: product.PriceToken,
    LocalFile: product.LocalFile,
  };
}

function CatalogueEditPage() {
  const {walletAddress} = useWallet()
  const config = getCurrentConfig();
  const supportedTokens = config.supportedTokens;
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [newProductPreviewUrl, setNewProductPreviewUrl] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [lastSelectedTokenType, setLastSelectedTokenType] = useState<string>(supportedTokens[0]?.tokenId ?? '');
  const [newProduct, setNewProduct] = useState<EditableProduct>({
    Name: '',
    Description: '',
    Price: '',
    PriceToken: supportedTokens[0]?.tokenId ?? '',
    LocalFile: undefined,
  });
  const [cdnPath, setCdnPath] = useState<string>()
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);

  useEffect(() => {
    if (!cdnPath && walletAddress) {
      setCdnPath(`${walletAddress.toLowerCase()}/${encodeBase64Uuid(crypto.randomUUID())}`)
    }
  }, [walletAddress, cdnPath])

  useEffect(() => {
    const urls: Record<string, string> = {};
    products.forEach(p => {
      if (p.LocalFile && !isHeicFile(p.LocalFile)) {
        urls[p.ProductId] = URL.createObjectURL(p.LocalFile);
      }
    });
    setPreviews(urls);
    // cleanup on unmount or change:
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [products]);

  useEffect(() => {
    if (!newProduct.LocalFile || isHeicFile(newProduct.LocalFile)) {
      setNewProductPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(newProduct.LocalFile);
    setNewProductPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [newProduct.LocalFile]);

  useEffect(() => {
    if (editingId) {
      const prod = products.find(p => p.ProductId === editingId);
      if (prod) {
        setNewProduct(toEditableProduct(prod, supportedTokens));
      }
    }
  }, [editingId, products, supportedTokens]);

  const selectImageFile = (file?: File) => {
    if (!file) {
      return;
    }

    if (!isSupportedImageFile(file)) {
      toast.error('Please select a supported image file (JPG, PNG, GIF, HEIC, or HEIF).');
      return;
    }

    setNewProduct((prev) => ({...prev, LocalFile: file}));
  };

  const handleImageDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    selectImageFile(e.dataTransfer.files?.[0]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    selectImageFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleAddOrUpdateProduct = () => {
    const {Name, Price, LocalFile} = newProduct;
    if (!cdnPath) {
      toast.error("Unable to generate upload path—wallet not connected yet.")
      return
    }

    if (!Name || !Price || !LocalFile) {
      toast('Missing Fields', {
        description: 'Please fill in Name, Price, and upload an Image.',
      });
      return;
    }
    const ext = getFileExtension(LocalFile.name) || (isHeicFile(LocalFile) ? 'heic' : 'jpg');
    const imageId = encodeBase64Uuid(crypto.randomUUID());
    const filename = `${cdnPath}.${imageId}.${ext}`;
    const imageUrl = `${config.cdnBasePath}/${filename}`;

    const selectedToken = supportedTokens.find(t => t.tokenId === newProduct.PriceToken);
    const decimals = selectedToken?.decimals ?? 0;

    const parsedPrice = parseFloat(newProduct.Price || '0');
    if (parsedPrice <= 0) {
      toast('Missing Fields', {
        description: 'Please fill correct Price',
      });
      return;
    }
    const microPrice = Math.round(parsedPrice * Math.pow(10, decimals));

    const productEntry: Product = {
      ProductId: editingId ?? encodeBase64Uuid(crypto.randomUUID()),
      Name: newProduct.Name,
      Description: newProduct.Description,
      Price: microPrice,
      PriceToken: newProduct.PriceToken,
      Image: imageUrl,
      LocalFile
    };

    setProducts((prev) => {
      if (editingId) {
        return prev.map((p) => (p.ProductId === editingId ? productEntry : p));
      }
      return [...prev, productEntry];
    });

    // Remember the selected token for next product
    setLastSelectedTokenType(newProduct.PriceToken);

    setNewProduct({
      Name: '',
      Description: '',
      Price: '',
      PriceToken: newProduct.PriceToken, // Keep the same token for next product
    });
    setEditingId(null);
    setShowModal(false);
    toast(editingId ? 'Product updated' : 'Product added');
  };

  const handleUploadAll = async () => {
    try {
      setUploading(true);

      for (const product of products) {
        if (product.LocalFile) {
          const filename = product.Image.replace(`${config.cdnBasePath}/`, '');

          const formData = new FormData();
          formData.append('file', product.LocalFile);
          formData.append('path', filename);

          const res = await fetch(`${config.fileApiUrl}/image`, {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) throw new Error(`Failed to upload image: ${filename}`);
        }
      }

      const res = await fetch(`${config.fileApiUrl}/json`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          path: `${cdnPath}.json`,
          content: products.map(p => {
            const clone = {...p};
            delete clone.LocalFile;
            return clone;
          }),
        }),
      });

      if (!res.ok) throw new Error('JSON upload failed');
      setShowFinishModal(true);
    } catch (err) {
      toast('Upload error', {
        description: (err as Error).message,
      });
    } finally {
      setUploading(false);
    }
  };

  const canChangeToken = (): boolean => {
    return products.length == 0;
  }

  const openAddProductModal = () => {
    setNewProduct({
      Name: '',
      Description: '',
      Price: '',
      PriceToken: lastSelectedTokenType, // Use the last selected token
    });
    setEditingId(null);
    setShowModal(true);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Catalogue Storage Options Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500"/>
            Catalog Storage Options
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-50 p-4 rounded border-l-4 border-blue-200 text-sm text-blue-700 space-y-3">
            <div className="flex items-start gap-3">
              <Cloud className="h-5 w-5 mt-0.5 text-blue-600 flex-shrink-0"/>
              <div>
                <p className="font-medium">Create with Merxet Seller</p>
                <p className="text-blue-600">
                  Use this page to create your product catalog and store it on our secure servers.
                  This is the easiest way to get started - just add your products and we'll handle the hosting. </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap  items-center justify-between gap-2">
            <CardTitle>Products List ({products.length})</CardTitle>
            <Button onClick={openAddProductModal} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2"/>
              Add New Product
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No products added yet. Click "Add New Product" to get started.</p>
            </div>
          ) : (
            products.map((product) => {
              const token = supportedTokens.find((t) => t.tokenId === product.PriceToken);
              if (!token) {
                // show an inline error for this one
                return (
                  <div key={product.ProductId} className="p-4 bg-red-50 text-red-700 rounded">
                    ⚠️ Unsupported token (coinType={product.PriceToken}) for “{product.Name}” </div>
                );
              }
              return (
                <div key={product.ProductId}
                     className="border rounded-md p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  {previews[product.ProductId] ? (
                    <img src={previews[product.ProductId]} alt={product.Name}
                         className="w-20 h-20 object-cover rounded self-center sm:self-auto"/>
                  ) : (
                    <div
                      className="w-20 h-20 rounded border bg-muted/40 self-center sm:self-auto flex flex-col items-center justify-center text-[10px] text-muted-foreground">
                      <FileImage className="w-5 h-5 mb-1"/>
                      <span>{product.LocalFile && isHeicFile(product.LocalFile) ? 'HEIC' : 'Image'}</span>
                    </div>
                  )}

                  <div className="flex-1">
                    <div className="font-bold text-lg">{product.Name}</div>
                    <div className="text-muted-foreground text-sm">{product.Description}</div>
                    <div className="mt-1 text-sm font-mono flex items-center flex-wrap gap-1">
                      {formatMicroToFull(product.Price, token.decimals)}{' '}
                      {token?.img && (
                        <img src={token.img} alt={token.name} className="inline w-4 h-4 ml-1"/>)}
                      {token?.name ?? ''}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap justify-end w-full sm:w-auto">
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditingId(product.ProductId);
                      setShowModal(true);
                    }}>
                      <Edit className="w-3 h-3 mr-1"/>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() =>
                      setProducts((prev) =>
                        prev.filter((p) => p.ProductId !== product.ProductId)
                      )
                    }>
                      <Trash2 className="w-3 h-3 mr-1"/>
                      Delete
                    </Button>
                  </div>
                </div>

              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload to Content Delivery Network (CDN)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/*
          <CopyableField label="Catalogue link:" value={`${config.cdnBasePath}/${cdnPath}.json`} length={30}
                         mdLength={100}></CopyableField>
          */}
          {/* Next Steps Information */}
          <div className="bg-blue-50 p-4 rounded border-l-4 border-blue-200 text-sm text-blue-700 space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 text-blue-600 flex-shrink-0"/>
              <div>
                <p className="font-medium">What happens next?</p>
                <p className="text-blue-600">
                  After uploading to our CDN, you'll be redirected to review your catalog and then store its link on
                  the {CRYPTO_NAME_BLOCKCHAIN}.
                  This final step makes your products discoverable to customers while keeping your data secure and
                  decentralized. </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-blue-600 pt-1">
              <span>Upload to CDN</span>
              <ArrowRight className="h-3 w-3"/>
              <span>Review Catalog</span>
              <ArrowRight className="h-3 w-3"/>
              <span>Store Link on {CRYPTO_NAME}</span>
              <ArrowRight className="h-3 w-3"/>
              <span>Print QR codes</span>
            </div>
          </div>

          <Button onClick={handleUploadAll} disabled={uploading || products.length === 0}>
            <Upload className="w-4 h-4 mr-2"/>
            {uploading ? 'Uploading...' : 'Upload All'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500"/>
            Other Storage Options
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-50 p-4 rounded border-l-4 border-blue-200 text-sm text-blue-700 space-y-3">
            <div className="flex items-start gap-3">
              <Server className="h-5 w-5 mt-0.5 text-blue-600 flex-shrink-0"/>
              <div>
                <p className="font-medium">Host on Your Own Server</p>
                <p className="text-blue-600">
                  Already have a catalog hosted elsewhere? You can use your own server or hosting provider.
                  Only the link to your catalog is stored on the {CRYPTO_NAME_BLOCKCHAIN}, giving you full control over
                  your
                  data. </p>
                <Link to="/add-product-catalogue"
                      className="inline-flex items-center gap-1 mt-2 text-blue-700 hover:text-blue-800 font-medium hover:underline">
                  <ExternalLink className="h-3 w-3"/>
                  Upload External Catalog URL
                </Link>
              </div>
            </div>

            <div className="pt-2 border-t border-blue-200">
              <p className="text-xs text-blue-600">
                <strong>Note:</strong> Regardless of where you store your catalog, only the URL link is recorded on
                the {CRYPTO_NAME_BLOCKCHAIN}.
                This ensures decentralization while giving you flexibility in how you manage your product data. </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div
            className="bg-background p-6 rounded-lg shadow-xl w-full max-w-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold">{editingId ? 'Edit Product' : 'Add New Product'}</h2>

            <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6">
              {/* Left Column - Product Details */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="name">Product Name</Label>
                    <span className="text-xs text-muted-foreground">
                                            {newProduct.Name.length} of {NAME_MAX_LENGTH}
                                        </span>
                  </div>
                  <Input id="name" value={newProduct.Name} onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= NAME_MAX_LENGTH) {
                      setNewProduct({...newProduct, Name: value});
                    }
                  }} placeholder="Enter product name" maxLength={NAME_MAX_LENGTH}/>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description">Description</Label>
                    <span className="text-xs text-muted-foreground">
                                            {newProduct.Description.length} of {DESCRIPTION_MAX_LENGTH}
                                        </span>
                  </div>
                  <Textarea id="description" rows={4} value={newProduct.Description} onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= DESCRIPTION_MAX_LENGTH) {
                      setNewProduct({...newProduct, Description: value});
                    }
                  }} placeholder="Describe your product..." maxLength={DESCRIPTION_MAX_LENGTH}/>
                </div>

                {/* Token and Price Row - Token on left, Price on right */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="token">Token</Label>
                    <select id="token"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!canChangeToken()} value={newProduct.PriceToken} onChange={(e) => setNewProduct({
                      ...newProduct,
                      PriceToken: e.target.value
                    })}>
                      {supportedTokens.map((token) => (
                        <option key={token.tokenId ?? token.id} value={token.tokenId ?? ''}>{token.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price">Price</Label>
                    <Input id="price" type="number" step="0.01" value={newProduct.Price}
                           onChange={(e) => setNewProduct({
                             ...newProduct,
                             Price: e.target.value
                           })} placeholder="0.00"/>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>Note:</strong> All products in the catalog must use the same token. </p>
              </div>

              {/* Right Column - Image Upload */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Product Image</Label>

                  {/* Hidden file input */}
                  <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" onChange={handleFileSelect}
                         className="hidden"/>

                  {/* Drag and drop area */}
                  <div onDragOver={(e) => e.preventDefault()} onDrop={handleImageDrop}
                       className="border-2 border-dashed border-input rounded-lg p-6 text-center bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer min-h-[200px] flex flex-col items-center justify-center"
                       onClick={() => fileInputRef.current?.click()}>
                    {newProduct.LocalFile ? (
                      <div className="space-y-3">
                        {newProductPreviewUrl ? (
                          <img src={newProductPreviewUrl}
                               className="max-w-full max-h-32 object-contain rounded" alt="Preview"/>
                        ) : (
                          <div
                            className="mx-auto flex max-w-full max-h-32 min-h-32 w-full flex-col items-center justify-center rounded border border-dashed bg-muted/40 px-4 text-center">
                            <FileImage className="h-8 w-8 text-muted-foreground"/>
                            <p className="mt-2 text-sm font-medium">
                              {isHeicFile(newProduct.LocalFile) ? 'HEIC image selected' : 'Preview unavailable'}
                            </p>
                            {isHeicFile(newProduct.LocalFile) && (
                              <p className="text-xs text-muted-foreground">
                                This file will still upload normally.
                              </p>
                            )}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {newProduct.LocalFile.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Click to change image </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <FileImage className="h-12 w-12 text-muted-foreground mx-auto"/>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Drop image here</p>
                          <p className="text-xs text-muted-foreground">
                            Supports <br/>JPG, PNG, GIF, HEIC, HEIF up to 10MB </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}>
                          <FileImage className="h-4 w-4 mr-2"/>
                          Select File
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddOrUpdateProduct}>
                {editingId ? 'Update Product' : 'Add Product'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showFinishModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-background p-6 rounded-md shadow-lg w-full max-w-md text-center space-y-4">
            <h2 className="text-lg font-semibold">Catalog Uploaded</h2>
            <p className="text-sm break-all text-muted-foreground">
              {`${config.cdnBasePath}/${cdnPath}.json`}
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => navigate('/add-product-catalogue',
                {state: {url: `${config.cdnBasePath}/${cdnPath}.json`}})}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CatalogueEditPage

import {useState} from "react";
import {Link} from "react-router-dom";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {PackageSearch, ShoppingCart, Bug, Home, Shield} from "lucide-react";
import WalletAuth from "@/components/WalletAuth";
import {useWallet} from "@/context/WalletContext";
import {APP_NAME, APP_VERSION, isAdminWalletAddress} from "@/config";

const Header: React.FC = () => {
  const [debugMenuOpen, setDebugMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const {walletAddress, network} = useWallet();

  const isAdmin = isAdminWalletAddress(walletAddress, network);

  return (
    <header
      className="sticky top-0 z-50 bg-background text-foreground border-b border-border bg-no-repeat bg-center overflow-hidden"
    >
      <div className="relative z-10 max-w-7xl mx-auto h-16 px-6 flex items-stretch justify-between">
        {/* Logo and Title */}
        <div className="flex items-center space-x-3">
          <Link to="/" className="cursor-pointer inline-flex items-center gap-2">
            <img src="/logo.svg" alt="Merxet Seller Logo" className="w-9 h-9"/>
            <h1 className="text-xl font-bold">Merxet Seller</h1>
          </Link>
        </div>

        {/* Desktop nav */}
        {walletAddress && (
          <nav className="hidden md:flex items-stretch gap-x-6 text-base font-medium tracking-wide">
            <Link to="/"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <Home className="h-5 w-5"/>
              Dashboard
            </Link>
            <Link to="/edit-product-catalogue"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <PackageSearch className="h-5 w-5"/>
              Create Catalog
            </Link>
            <Link to="/my-orders"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ShoppingCart className="h-5 w-5"/>
              My Orders
            </Link>
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center space-x-2">
          {/* Admin Menu */}
          {isAdmin && (
            <Popover open={adminMenuOpen} onOpenChange={setAdminMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
                  aria-label="Admin Menu">
                  <Shield className="h-5 w-5"/>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-2">
                <div className="space-y-1">
                  <Link to="/admin/topic"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        onClick={() => setAdminMenuOpen(false)}>
                    🛠️ Topic Admin
                  </Link>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Debug Menu */}
          <Popover open={debugMenuOpen} onOpenChange={setDebugMenuOpen}>
            <PopoverTrigger asChild>
              <button
                className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
                aria-label="Debug Menu">
                <Bug className="h-5 w-5"/>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-2">
              <div className="space-y-1">
                <Link to="/debug/test-encryption"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                      onClick={() => setDebugMenuOpen(false)}>
                  🔐 Test Encryption
                </Link>
                <Link to="/debug/test-decryption"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                      onClick={() => setDebugMenuOpen(false)}>
                  🔓 Test Decryption
                </Link>
                <div className="justify-center text-center text-xs text-muted-foreground py-1">
                  © {new Date().getFullYear()} {APP_NAME.toUpperCase()} SELLER <br/> v{APP_VERSION}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <WalletAuth/>
        </div>
      </div>
    </header>
  );
};

export default Header;

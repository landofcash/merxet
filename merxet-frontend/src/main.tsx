import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter, Routes, Route} from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import CartPage from './pages/CartPage.tsx'
import QrScanPage from './pages/QrScanPage.tsx'
import ProductDetailPage from './pages/ProductDetailPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'
import OrderPage from './pages/OrderPage.tsx'
import OrderHistoryPage from './pages/OrderHistoryPage.tsx'
import PayWithCryptoPage from './pages/PayWithCryptoPage.tsx'
import PayWithCreditCardPage from './pages/PayWithCreditCardPage.tsx'
import WalletPage from './pages/WalletPage.tsx'
import TestEncryptionPage from './pages/debug/TestEncryptionPage.tsx'
import TestDecryptionPage from './pages/debug/TestDecryptionPage.tsx'
import LogViewerPage from './pages/debug/LogViewerPage.tsx'
import {WalletProvider} from './context/WalletContext.tsx'
import Layout from './components/Layout.tsx'
import UrlParserAndRedirector from './components/UrlParserAndRedirector.tsx'
import {OrderProvider} from './context/OrderContext.tsx'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <WalletProvider>
            <OrderProvider>
                <BrowserRouter>
                    <Layout>
                        <UrlParserAndRedirector/>
                        <Routes>
                            <Route path="/" element={<App/>}/>
                            <Route path="/cart" element={<CartPage/>}/>
                            <Route path="/scan" element={<QrScanPage/>}/>
                            <Route path="/product-details" element={<ProductDetailPage/>}/>
                            <Route path="/settings" element={<SettingsPage/>}/>
                            <Route path="/wallet" element={<WalletPage/>}/>
                            <Route path="/order" element={<OrderPage/>}/>
                            <Route path="/orders" element={<OrderHistoryPage/>}/>
                            <Route path="/pay-crypto" element={<PayWithCryptoPage/>}/>
                            <Route path="/pay-credit-card" element={<PayWithCreditCardPage/>}/>
                            <Route path="/debug/encrypt" element={<TestEncryptionPage/>}/>
                            <Route path="/debug/decrypt" element={<TestDecryptionPage/>}/>
                            <Route path="/debug/logs/:category" element={<LogViewerPage/>}/>
                            <Route path="/debug/hedera" element={<LogViewerPage/>}/>
                        </Routes>
                    </Layout>
                </BrowserRouter>
            </OrderProvider>
        </WalletProvider>
    </StrictMode>,
)

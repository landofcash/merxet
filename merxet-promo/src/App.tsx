import {lazy, Suspense} from 'react';
import {Routes, Route} from 'react-router-dom';

const PromoApp = lazy(() => import('./promo/PromoApp'));
const StorefrontApp = lazy(() => import('./app/StorefrontApp'));

export default function App() {
  return <Suspense fallback={<div role="status" className="p-8">Loading…</div>}>
    {__STOREFRONT_MODE__ ? <Routes><Route path="/*" element={<StorefrontApp/>}/></Routes> : <Routes>
      <Route path="/storefront/*" element={<StorefrontApp prefix="/storefront"/>}/>
      <Route path="/*" element={<PromoApp/>}/>
    </Routes>}
  </Suspense>;
}

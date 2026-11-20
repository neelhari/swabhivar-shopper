# Senior Mobile Performance Audit: Swabhivar Shoppers (Capacitor)

---

## 1. Summary

The application suffers from severe frame stutter and an artificial "stuck" feeling caused by three main architectural bottlenecks:
1. **Artificial Page & Splash Freezes**: `AnimatePresence mode="wait"` imposes an unavoidable 300ms freeze on every screen navigation, compounded by a 2000ms hardcoded `setTimeout` and a multi-second GSAP timeline in `SplashScreen.jsx`.
2. **Monolithic JavaScript Bundle & Main-Thread Blocking**: All 65+ application pages (Storefront, Admin, Vendor, Support) are synchronously imported into a single 1.67 MB bundle without route-based code splitting (`React.lazy`), accompanied by simultaneous execution of both Framer Motion and GSAP.
3. **Unvirtualized DOM & Re-Render Cascades**: Product catalogues (up to hundreds of items) render full DOM trees with unmemoized `ProductCard` components that re-parse JSON and re-render across the entire page whenever cart or wishlist state changes.

---

## 2. What Is Already Good

- **Local Asset Serving**: `capacitor.config.json` correctly points `webDir` to `"dist"` with `androidScheme: "https"`. Production is not loading from an external or dev server URL.
- **Backpack Backdrop Filter Disabled**: In `shopper/src/index.css`, costly `backdrop-filter: blur(...)` styles were explicitly stripped via `.glass-panel, [class*="backdrop-blur"] { backdrop-filter: none !important; }`, preventing GPU fill-rate throttling.
- **Hardware Back Button Handling**: `shopper/src/components/GlobalBackButtonListener.jsx` integrates with `@capacitor/app` to handle Android native back navigation.
- **Clean Console Output**: Zero leftover `console.log` statements in source files; `console.error` and `console.warn` are reserved for actual error catches.
- **Production Asset Hashing**: `shopper/vite.config.js` properly hashes chunk and entry assets to prevent stale webview cache hits.
- **Modern Android Tooling**: `shopper/android/variables.gradle` targets modern Android SDK 36 with `minSdkVersion 24` (Android 7.0+), avoiding legacy Android 5/6 WebView rendering bugs.

---

## 3. Findings Table

| ID | Area | Problem | File:line | Impact on smoothness | Fix effort (min) | RISK of fixing | Confidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | C. Animations | `mode="wait"` in `AnimatePresence` blocks new screen mounting for 300ms on every tap | `shopper/src/App.jsx:91-100, 107` | **High** | 5 | **Low** | Verified |
| **F-02** | C. CSS & Touch | Missing `touch-action: manipulation` and tap highlight removal causes 300ms tap delay and web flash | `shopper/src/index.css:49-53` | **High** | 5 | **Low** | Verified |
| **F-03** | B. Splash & Boot | Triple splash screen with hardcoded 2000ms `setTimeout` and 4.5s GSAP timeline delays initial interaction | `shopper/src/App.jsx:168-171`<br>`shopper/src/components/SplashScreen.jsx:12-56` | **High** | 10 | **Low** | Verified |
| **F-04** | E. React Rendering | `ProductCard` unmemoized; subscribes to entire cart & wishlist arrays, re-rendering every card on page | `shopper/src/components/ProductCard.jsx:93-96, 273` | **High** | 10 | **Low** | Verified |
| **F-05** | E. React Rendering | Inline `JSON.parse` executed synchronously on every render pass for every product card | `shopper/src/components/ProductCard.jsx:68, 81, 105` | **Med** | 10 | **Low** | Verified |
| **F-06** | F. Network & Data | Axios client lacks request timeout; stalled sockets hang spinners indefinitely on cellular networks | `shopper/src/utils/api.js:21-23` | **Med** | 5 | **Low** | Verified |
| **F-07** | B. Network & Fonts | Duplicate external Google Fonts network `@import` blocks CSS parsing and causes FOIT | `shopper/src/index.css:1`<br>`shopper/index.html:16` | **Med** | 5 | **Low** | Verified |
| **F-08** | G. Android Shell | Missing `android:windowSoftInputMode="adjustResize"` causes keyboard jumping/hiding inputs | `shopper/android/app/src/main/AndroidManifest.xml:13-19` | **Med** | 5 | **Low** | Verified |
| **F-09** | A. Security / ATS | Hardcoded plain HTTP API URL requires `usesCleartextTraffic="true"` (blocks iOS ATS / flagged on Android) | `shopper/src/utils/api.js:5`<br>`shopper/android/app/src/main/AndroidManifest.xml:11` | **High** | 15 | **Medium** | Verified |
| **F-10** | B. Bundle Size | Monolithic 1.67 MB bundle; 65+ pages (Admin, Vendor, Support) bundled into initial payload | `shopper/src/App.jsx:13-90` | **High** | 45 | **Medium** | Verified |
| **F-11** | B. Asset Weight | Unoptimized 2.4 MB local hero images (`.png`/`.jpg`) loaded directly on home page mount | `shopper/src/pages/HomePage.jsx:12-14` | **Med** | 20 | **Low** | Verified |
| **F-12** | C. Main Thread | GSAP staggering animation executed across entire home page DOM right when catalogue renders | `shopper/src/pages/HomePage.jsx:77-88` | **Med** | 10 | **Low** | Verified |
| **F-13** | D. Scrolling | Unvirtualized product grids in catalogue and category pages mount hundreds of heavy DOM nodes | `shopper/src/pages/CategoryListingPage.jsx:601-606` | **High** | 60 | **High** | Verified |
| **F-14** | A. Release Build | Android native release build has `minifyEnabled false` (ProGuard/R8 dead-code elimination disabled) | `shopper/android/app/build.gradle:21` | **Low** | 10 | **Medium** | Verified |
| **F-15** | H. Reliability | Missing top-level React Error Boundary; runtime error in any card crashes entire app to blank screen | `shopper/src/main.jsx:1-12` | **Med** | 15 | **Low** | Verified |

---

## 4. Fix Plan

### SAFE NOW (Low Risk, Immediate Smoothness Gains)

#### 1. Eliminate 300ms Navigation Freeze (Fixes F-01)
* **Problem**: In `shopper/src/App.jsx:91-100, 107`, every screen transition uses Framer Motion `mode="wait"`. When the user taps a tab or product, the app artificially waits 300ms for the exiting page to animate out before starting to mount the new page.
* **Code Change**:

```jsx
// FILE: shopper/src/App.jsx
// BEFORE (Lines 91-100, 107):
function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function AnimatedAppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>

// AFTER:
function PageTransition({ children }) {
  return children;
}

function AnimatedAppRoutes() {
  const location = useLocation();
  return (
    <Routes location={location}>
```

---

#### 2. Eliminate 300ms Tap Delay & Native Touch Flash (Fixes F-02)
* **Problem**: In `shopper/src/index.css`, absence of `touch-action: manipulation` causes Android WebView to buffer touch events by ~300ms to detect double-taps. Missing `-webkit-tap-highlight-color` causes ugly grey flash boxes.
* **Code Change**:

```css
/* FILE: shopper/src/index.css */
/* BEFORE (Lines 49-53): */
body {
  font-family: 'Poppins', sans-serif;
  background-color: var(--color-brand-light-bg);
  color: var(--color-brand-text);
}

/* AFTER: */
html, body {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
}

input, textarea, [contenteditable="true"] {
  user-select: text;
}

body {
  font-family: 'Poppins', sans-serif;
  background-color: var(--color-brand-light-bg);
  color: var(--color-brand-text);
}
```

---

#### 3. Cut Artificial 2-Second Boot Lag (Fixes F-03)
* **Problem**: In `shopper/src/App.jsx:168-171`, a hardcoded `setTimeout` of `2000ms` holds an overlay splash screen even after React and catalogue data have finished loading.
* **Code Change**:

```jsx
// FILE: shopper/src/App.jsx
// BEFORE (Lines 165-173):
  useEffect(() => {
    if (showSplash) {
      try { sessionStorage.setItem('splash_shown', 'true'); } catch {}
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showSplash]);

// AFTER:
  useEffect(() => {
    if (showSplash) {
      try { sessionStorage.setItem('splash_shown', 'true'); } catch {}
      // Immediately dismiss as soon as store data has arrived
      if (!loading) {
        setShowSplash(false);
      }
    }
  }, [showSplash, loading]);
```

---

#### 4. Stop ProductCard Re-Render Storms (Fixes F-04 & F-05)
* **Problem**: In `shopper/src/components/ProductCard.jsx:93-102, 273`, `ProductCard` is not memoized and pulls the full `cartItems` and `wishlistItems` arrays from Zustand. Every time any cart quantity changes, every single card on the page re-renders and re-parses size JSON strings.
* **Code Change**:

```jsx
// FILE: shopper/src/components/ProductCard.jsx
// BEFORE (Lines 93-102):
export function ProductCard({ product, layout = 'grid' }) {
  const navigate = useNavigate();
  const { toggleWishlist, items: wishlistItems } = useWishlistStore();
  const { addToCart, items: cartItems } = useCartStore();
  const { token } = useAuthStore();
  const [imgErr, setImgErr] = useState(false);

  const isWishlisted = wishlistItems.includes(product.id);
  const isAdded = cartItems?.some(item => item.product.id === product.id);

// AFTER (Lines 93-102):
export const ProductCard = React.memo(function ProductCard({ product, layout = 'grid' }) {
  const navigate = useNavigate();
  const toggleWishlist = useWishlistStore(s => s.toggleWishlist);
  const isWishlisted = useWishlistStore(s => s.items.includes(product.id));
  const addToCart = useCartStore(s => s.addToCart);
  const isAdded = useCartStore(s => s.items.some(item => (item.product?.id || item.product_id) === product.id));
  const { token } = useAuthStore();
  const [imgErr, setImgErr] = useState(false);

// AND AT BOTTOM (Line 273):
// BEFORE:
}
// AFTER:
});
```

---

#### 5. Add Axios Request Timeout (Fixes F-06)
* **Problem**: In `shopper/src/utils/api.js:21-23`, `axios.create` sets no timeout. When a mobile device enters an elevator or patchy 4G/5G, network calls hang indefinitely, leaving UI in an unrecoverable frozen state.
* **Code Change**:

```javascript
// FILE: shopper/src/utils/api.js
// BEFORE (Lines 21-23):
const api = axios.create({
  baseURL: resolveBackendUrl(import.meta.env.VITE_API_URL),
});

// AFTER:
const api = axios.create({
  baseURL: resolveBackendUrl(import.meta.env.VITE_API_URL),
  timeout: 12000, // 12-second ceiling prevents infinite stuck spinners
});
```

---

#### 6. Remove Duplicate Network Font `@import` (Fixes F-07)
* **Problem**: `shopper/src/index.css:1` has an `@import url('https://fonts.googleapis.com/...')`. Because fonts are already linked in `shopper/index.html:15-16`, the CSS `@import` blocks CSSOM construction on cold start.
* **Code Change**:

```css
/* FILE: shopper/src/index.css */
/* BEFORE (Line 1): */
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700;800&display=swap');
@import "tailwindcss";

/* AFTER: */
@import "tailwindcss";
```

---

#### 7. Fix Android Keyboard Viewport Squishing (Fixes F-08)
* **Problem**: `shopper/android/app/src/main/AndroidManifest.xml:13-19` does not set `android:windowSoftInputMode`. Opening the keyboard on inputs forces full WebView height re-layout and causes stutter.
* **Code Change**:

```xml
<!-- FILE: shopper/android/app/src/main/AndroidManifest.xml -->
<!-- BEFORE (Line 14): -->
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"

<!-- AFTER: -->
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:windowSoftInputMode="adjustResize"
            android:name=".MainActivity"
```

---

#### 8. Prevent GSAP Home Stagger Main-Thread Choke (Fixes F-12)
* **Problem**: `shopper/src/pages/HomePage.jsx:77-88` triggers a multi-element GSAP stagger animation on `.animate-section` immediately after catalogue data finishes loading, causing frame drops while the user is trying to begin scrolling.
* **Code Change**:

```jsx
// FILE: shopper/src/pages/HomePage.jsx
// BEFORE (Lines 77-88):
  useGSAP(() => {
    if (!loading) {
      gsap.from('.animate-section', {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: 'power3.out',
        clearProps: 'all'
      });
    }
  }, { scope: container, dependencies: [loading] });

// AFTER:
  // Disabled on mobile viewport to maintain 60/120fps touch responsiveness
  useGSAP(() => {
    if (!loading && window.innerWidth >= 1024) {
      gsap.from('.animate-section', {
        y: 20,
        opacity: 0,
        duration: 0.4,
        ease: 'power2.out',
        clearProps: 'all'
      });
    }
  }, { scope: container, dependencies: [loading] });
```

---

### AFTER RELEASE (Medium / High Risk Architectural Improvements)

1. **Route-Based Code Splitting via `React.lazy` (Fixes F-10)**:
   * *Plan*: Lazy load the heavy admin portal (24 routes), vendor portal (15 routes), and support portal (6 routes) using `const AdminDashboardPage = React.lazy(() => import('./pages/admin/AdminDashboardPage'))`. This will slash the customer mobile initial bundle from 1.67 MB down to ~450 KB.
   * *Why Post-Release*: Requires adding `<Suspense fallback={<RouteLoadingSpinner />}>` across all route trees and testing offline chunk loading edge cases.
2. **Product Grid Virtualization (Fixes F-13)**:
   * *Plan*: Implement `@tanstack/react-virtual` or windowed pagination on `CategoryListingPage.jsx` so only the ~8 visible product cards exist in the DOM at any scroll position.
   * *Why Post-Release*: High risk of visual layout shifts or breaking scroll position restoration when navigating back from `ProductDetailPage`.
3. **Switch Production API Endpoint to HTTPS (Fixes F-09)**:
   * *Plan*: Point `PRODUCTION_API_URL` to a valid SSL domain (e.g. `https://api.swabhivarshoppers.com`) and remove `android:usesCleartextTraffic="true"` from `AndroidManifest.xml`.
   * *Why Post-Release*: Requires DNS & SSL certificate verification on the AWS EC2 load balancer / Nginx setup.
4. **Android R8 / ProGuard Minification (Fixes F-14)**:
   * *Plan*: Enable `minifyEnabled true` in `android/app/build.gradle` and configure `proguard-rules.pro` for Capacitor plugins.
   * *Why Post-Release*: Requires end-to-end smoke testing of all third-party plugins (Razorpay, Capacitor core) to verify no native reflection classes were stripped.

---

## 5. Test Checklist (Verifying SAFE NOW Fixes on Device)

Test on an Android device running a release build (`./gradlew assembleRelease` or installed APK):

- [ ] **Tab & Navigation Responsiveness**:
  - *Action*: From the bottom navigation bar, tap rapidly between **Home**, **Shop**, **Wallet**, and **Wishlist**.
  - *Measure*: Screen must switch instantaneously with **0ms lag**. There should be no white flash or 300ms frozen exit animation.
- [ ] **Instant Button Tap Recognition**:
  - *Action*: Tap any product card or the "Add to Cart" button.
  - *Measure*: Confirm the tap fires on touch release without the standard 300ms mobile browser delay. Verify no grey rectangle tap highlight flashes over the card.
- [ ] **Cold App Launch**:
  - *Action*: Force-close the app from Android Recent Apps and launch from home screen.
  - *Measure*: App must transition directly from native splash to interactive catalogue without being held at a secondary animated screen for 2+ seconds.
- [ ] **Catalogue Scroll Smoothness**:
  - *Action*: Flick scroll vigorously through the Home page and "All Products" category page.
  - *Measure*: Observe frame rate using Android Developer Options -> *GPU Rendering / Profile HWUI*. Bars must remain below the 16.6ms green threshold line (steady 60fps).
- [ ] **Cart Mutation Isolation**:
  - *Action*: On a category page with 30+ items, tap "Add to Cart" on item #1.
  - *Measure*: Only item #1's button changes state. The scroll position does not hitch and other cards do not flicker.
- [ ] **Keyboard Interaction**:
  - *Action*: Tap the search input at the top of the Home or Shop page.
  - *Measure*: Virtual keyboard opens smoothly without squishing the entire webview or jumping scroll offset.

---

## 6. Things Could Not Be Verified & Needed Information

1. **iOS Project Status**:
   * *Status*: Unverified. No `ios` directory was found inside `shopper/`.
   * *Info Needed*: Is Swabhivar Shoppers targeting Android-only for this upcoming release, or will `npx cap add ios` be configured on a separate macOS build machine?
2. **Production Domain & SSL Certificate**:
   * *Status*: Unverified. `shopper/src/utils/api.js` connects to raw IP `http://13.201.223.39/api`.
   * *Info Needed*: Does Swabhivar Shoppers have an active HTTPS domain (e.g. `https://api.swabhivarshoppers.com`) ready to be mapped to the EC2 server before Google Play / Apple App Store submission?
3. **Production Razorpay Key**:
   * *Status*: Unverified. `shopper/.env.production` defines `VITE_RAZORPAY_KEY_ID=rzp_test_TX3YAdqaVHHcZ9`.
   * *Info Needed*: Will live Razorpay keys (`rzp_live_...`) be injected via CI/CD environment variables during the final release build?

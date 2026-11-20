# Go-Live Notes & Checklist

## Test Configuration Cleanups Before Production Release

### 1. Capacitor Mixed Content Setting
> [!IMPORTANT]
> **`allowMixedContent` must be removed from both capacitor configs when the API moves to HTTPS.**
> 
> - File 1: `shopper/capacitor.config.customer.json`
> - File 2: `shopper/capacitor.config.vendor.json`
> 
> Under the `"android"` block, remove `"allowMixedContent": true`. In production, the backend API will run under HTTPS (`https://api.swabhivarshopper.com/api`), which matches the app's HTTPS origin (`https://localhost` or `https://customer.swabhivarshopper.com`), so mixed content bypass will no longer be needed or allowed.

### 2. Backend URLs
When switching from local test IP to the live domain:
- Update `.env.customer` and `.env.vendor`:
  ```ini
  VITE_API_URL=https://api.swabhivarshopper.com/api
  VITE_BACKEND_URL=https://api.swabhivarshopper.com/api
  ```

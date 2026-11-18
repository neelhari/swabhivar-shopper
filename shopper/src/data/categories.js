export const categories = [
  { id: 'diyas', name: 'Diyas', icon: 'Flame' },
  { id: 'idols', name: 'Idols', icon: 'Sparkles' },
  { id: 'rudraksha', name: 'Rudraksha', icon: 'Circle' },
  { id: 'pooja-kits', name: 'Pooja Kits', icon: 'Gift' },
  { id: 'agarbatti', name: 'Agarbatti', icon: 'Wind' },
  { id: 'bells', name: 'Bells', icon: 'Bell' },
  { id: 'kumkum', name: 'Kumkum', icon: 'Droplet' },
  { id: 'flowers', name: 'Flowers', icon: 'Flower2' },
  { id: 'camphor', name: 'Camphor', icon: 'Cloud' },
  { id: 'more', name: 'More', icon: 'Grid' },
];

export const materials = [
  { id: 'brass', name: 'Brass', color: '#B5A642' },
  { id: 'copper', name: 'Copper', color: '#B87333' },
  { id: 'silver', name: 'Silver', color: '#C0C0C0' },
  { id: 'marble', name: 'Marble', color: '#F0F8FF' },
  { id: 'wooden', name: 'Wooden', color: '#8B5A2B' },
];

export const festivals = [
  {
    id: 'ganesh-chaturthi', namWe have successfully migrated the actual Neon data into the existing AWS EC2 PostgreSQL database shopper_db.

The backend has restarted and reports:
      "PostgreSQL database connected"

Now begin the next phase: AWS application validation and Neon dependency inspection.

      IMPORTANT: This phase is READ- ONLY.Do not modify any files or configurations yet.

### A.Verify the running application

Inspect and test the existing EC2 application:

  1. Confirm PM2 process shoopp - api is online.
2. Confirm backend connects to 127.0.0.1: 5432 / shopper_db.
3. Test these existing API endpoints:
  - /api/general / db - test
  - /api/general / categories
  - /api/general / products
  - /api/general / banners
  - /api/general / vendors
  - /api/offers / active
  - /api/advertisements
  - /api/subscriptions / plans
4. Check authentication routes for customer, vendor and admin login.Do not expose credentials or perform unnecessary password - reset operations.
5. Inspect cart, orders, payments, payouts and subscription API functionality.
6. Check PM2 and Nginx logs for database errors, missing columns, runtime errors or failed API requests.

### B.Inspect Neon dependencies

Search the complete frontend and backend project, including deployment configurations and scripts, for:

  - neon.tech
    - Neon database connection strings
      - DATABASE_URL references
        - Hardcoded Neon fallback URLs
          - Neon - specific database configuration
            - Utility scripts that connect directly to Neon
              - Vercel environment configurations still pointing to Neon

Identify every remaining reference and classify it as:
1. Active runtime dependency.
2. Unused fallback or obsolete code.
3. Documentation or historical reference.
4. External deployment configuration requiring attention.

### C.Verify the active database connection

Confirm the running PM2 backend is using the EC2 PostgreSQL database shopper_db.

  Inspect active connections and relevant application configuration without exposing credentials.

### D.Final report

Provide:
- API endpoint test results.
- Authentication and business functionality test results.
- Database connection confirmation.
- PM2 / Nginx health.
- All remaining Neon references with exact file paths.
- Any issues that could break the existing application.
- Recommended next steps to eliminate Neon safely.

STRICT RESTRICTIONS:
- Do not modify source code.
- Do not modify.env or DATABASE_URL.
- Do not restart or stop services.
- Do not modify S3, IAM or CloudFront.
- Do not revoke Neon credentials.
- Do not delete databases or backups.
- Do not expose passwords, tokens, hashes or customer PII.

This is inspection and testing only.Wait for approval before making any changes.e: 'Ganesh Chaturthi' },
{ id: 'navratri', name: 'Navratri' },
{ id: 'diwali', name: 'Diwali' },
{ id: 'varalakshmi', name: 'Varalakshmi Vratham' },
{ id: 'satyanarayana', name: 'Satyanarayana Pooja' },
];

# บ้านขนมเส้น — QR table ordering

Customers scan the QR on their table, order from the menu, and follow their order's status. The kitchen sees tickets. Staff handle bills and payment.

| Route | Who | What |
|---|---|---|
| `/t/:qr_token` | customer (no login) | menu → options → review cart → order status; call staff; ask for bill |
| `/kitchen` | staff | ticket rail, tap dish to cycle status, two-step cancel, undo, sound, "total to scoop" |
| `/staff` | staff | tables + bill / change / PromptPay / close / reopen / order on behalf; sold-out toggles; today's sales. Owner: monthly Excel, print QR |
| `/login` | staff | email + password |

## Set up

1. Create a Supabase project. In the SQL editor, run `supabase/migrations/001_init.sql`, then `supabase/seed.sql` (the menu and prices there are **placeholders**).
2. Authentication → Users → add each staff member (email + password). Then:
   ```sql
   insert into staff_profiles (user_id, display_name, role)
   select id, 'แม่', 'owner' from auth.users where email = 'owner@example.com';
   ```
3. Copy `.env.example` to `.env` and fill in the URL, the anon key, the shop name and the PromptPay ID.
4. `npm install`, then `npm run dev`. Deploy `dist/` to Vercel or Netlify (the SPA rewrites are in `vercel.json` and `public/_redirects`).
5. Log in as the owner → พิมพ์ QR โต๊ะ → print and stick the codes on the tables.

## Tests

- `npm run test:sql`: runs the migration and seed on PGlite (Postgres 16 in WASM) with a small Supabase shim, then checks pricing, validation, sold-out, rate limiting, RLS and grants, close/reopen, and Bangkok month boundaries.
- `npm run test:promptpay`: compares `src/lib/promptpay.js` with the `promptpay-qr` package.
- `npm run dev:mock`: lets you click through every screen against an in-memory fake Supabase (`tests/mock-supabase.js`). It is not a security test.

**Windows note:** if you see `Cannot read directory "../../../..": Access is denied` during `vite build` or `vite dev`, a parent folder (here under OneDrive) cannot be read by esbuild. Build from a folder outside OneDrive, e.g. `C:\dev\baan-khanom-sen`.

# Maintenance Team 10 Frontend

This is a separate API test client for the backend in `../backend`. For the complete teammate setup, including Supabase database and authentication requirements, read [`../backend/README.md`](../backend/README.md).

## Run

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The client runs at `http://localhost:3001` and sends requests to `NEXT_PUBLIC_API_BASE_URL`.

The backend must be running at `http://localhost:3000` before sending requests.

Set the Supabase URL and anon/publishable key in `.env.local`. The console lets you choose the `reporter1@gmail.com` or `staff1@gmail.com` test account and sign in with its password. The resulting access token is kept in memory and forwarded to the backend.

Paste a Supabase access token into the request form to test protected routes. The token is kept in memory by the browser and is not stored in the repository.

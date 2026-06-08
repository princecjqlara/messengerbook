# FollowUp OS Prototype

Multi-tenant prototype for Messenger lead follow-up, booking pages, and A/B message optimization.

## Run

Run the Node server so the app can use Supabase Auth and shared database state:

```bash
npm start
```

Then open:

```text
http://127.0.0.1:3000/index.html
```

Before using real cross-browser tenant login, run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor.

Demo sign-ins:

- Head admin: `headadmin@example.com` / `admin123`

Tenant login:

- Head admin creates tenant accounts under `Users & Pages`.
- Head admin assigns pages to each tenant user.
- Tenants sign in with the email and password created by the head admin.
- No tenant invite link is required.

Local state:

- The app now starts with no fake tenants.
- Browser state is used as a fallback when the backend is unavailable.
- With `server.js` running and the Supabase schema installed, users and tenants sync to Supabase.
- Old placeholder tenants are removed automatically.
- If login gets stuck after code changes, use `Repair local state` on the login screen.

## Included

- Tenant switching and isolated tenant settings.
- Email/password sign-in backed by Supabase Auth when the Node server is running.
- Head-admin-only Facebook Page connection area.
- No manual page form: head admin uses `Connect with Facebook`, then chooses a returned page.
- Page assignment to users so staff only see assigned tenants.
- Old Messenger contact import entry point for the planned Meta backend.
- New Messenger contact capture through the planned Meta webhook backend.
- First reply CTA with booking-link button copy.
- Per-contact best contact hour from engagement history.
- Top 1 follow-up queue.
- Human-agent follow-ups inside a configurable 7-day window.
- Utility-template follow-ups after the human window.
- Configurable follow-up intervals such as `1,3,3` or `1,1,3,7`.
- A/B message ranking by response rate.
- Admin booking-page editor with copy, offer, photo URL, color, and shareable link.
- Availability rules, meeting length, and max overlapping meetings.
- Public booking page with slot selection and booking request capture.

## Production Integration Notes

The live backend should connect these local workflows to:

- Meta Webhooks for new Messenger messages.
- Meta OAuth/Login for Business so the head admin connects pages from the app UI.
- In the current local prototype this uses the browser Facebook SDK. For production, move token exchange and page-token storage to backend routes.
- Meta app-role or app-access validation before a user can access the system.
- Per-page access tokens stored tenant-scoped in Supabase, not in `.env`.
- Meta Pages and Messenger permissions for contacts that are legally available to each connected page.
- Messenger Send API for messages inside the allowed messaging window.
- Approved utility templates for messages after the human-agent window.
- Supabase tables for app users and tenant state. The next production hardening step is splitting tenant JSON into dedicated tenant-scoped tables for contacts, messages, templates, schedules, bookings, and audit logs.
- A scheduler or queue worker for best-time follow-up delivery.

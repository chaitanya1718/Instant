
# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/85b29068-974a-44e7-802f-bff946c51e62

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `GROQ_API_KEY` in `.env` to your Groq API key
3. Run the app:
   `npm run dev`

## Split Deploy: Vercel + Render

Frontend on Vercel:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com`

Backend on Render:

- Runtime: `Node`
- Build command: `npm install`
- Start command: `npm run start`
- Environment variables:
  - `NODE_ENV=production`
  - `APP_BASE_URL=https://YOUR-VERCEL-DOMAIN.vercel.app`
  - `FRONTEND_URL=https://YOUR-VERCEL-DOMAIN.vercel.app`
  - `JWT_SECRET=...`
  - `MONGODB_URI=...`
  - `GROQ_API_KEY=...`
  - For email, either configure SMTP env vars or use an email API provider like Resend:
    - `EMAIL_PROVIDER=resend`
    - `RESEND_API_KEY=...`
    - `RESEND_FROM_EMAIL=...`
    - `RESEND_FROM_NAME=DailyFlow`

Notes:

- Password reset links are built from `APP_BASE_URL`, so set it to the frontend URL, not the Render URL.
- `FRONTEND_URL` is used for CORS so the Vercel app can call the Render API.
- Render free instances block common SMTP ports, so using an HTTP email provider like Resend is the safer production option.

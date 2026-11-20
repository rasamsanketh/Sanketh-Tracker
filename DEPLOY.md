# Deploy to Vercel

Deploy the frontend and API as two Vercel projects from the same Git repository. The API uses MongoDB Atlas in production because Vercel function filesystems are not persistent.

## 1. Prepare MongoDB Atlas

1. Create an Atlas cluster and a database user with a strong password.
2. Copy the application connection string, replace its username/password and database name, and keep it private.
3. Configure Atlas Network Access for Vercel. Prefer supported static egress allowlisting. If your Vercel plan has no static egress, Atlas may require `0.0.0.0/0`; use a dedicated database user with a strong password and least-privilege access.

## 2. Deploy the API

1. Import the repository as a new Vercel project.
2. Set **Root Directory** to `server`.
3. Keep the detected Express framework and default build settings. Vercel detects the exported Express app in `src/index.js`.
4. Add these Production environment variables in the Vercel project settings:
   - `MONGODB_URI` — the Atlas connection string.
   - `JWT_SECRET` — a long random value. Generate one locally with:

     ```powershell
     node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
     ```

   - `CLIENT_ORIGIN` — add the exact frontend origin after deploying the frontend (no trailing slash).
5. Deploy the project. Its health endpoint should be `https://<api-project>.vercel.app/api/health` and report `mongodb`.

Do not set `ENABLE_REGISTRATION`; production registration is disabled. The app creates an anonymous guest workspace automatically.

## 3. Deploy the frontend

1. Import the same repository as a second Vercel project.
2. Set **Root Directory** to `client`; use the detected Vite framework and default build settings.
3. Add the Production environment variable `VITE_API_URL` with the API base URL, for example `https://<api-project>.vercel.app/api`.
4. Deploy the project, then copy its exact production origin (for example `https://<client-project>.vercel.app`).
5. Set that origin as `CLIENT_ORIGIN` in the API project's environment variables and redeploy the API.

If you use more than one frontend origin, set `CLIENT_ORIGINS` on the API to a comma-separated list instead of `CLIENT_ORIGIN`. Add preview origins explicitly if you want preview deployments to call the API.

## Guest workspace behavior

The app does not show signup or login. On first visit, it creates an anonymous guest workspace and saves its access token in that browser's local storage. MongoDB persists the workspace data, but clearing browser storage loses the token and access to that workspace. Do not store sensitive or irreplaceable information in a guest workspace.

## Local development

Without `MONGODB_URI`, the API uses `server/data/store.json`. With `MONGODB_URI` set, it uses MongoDB instead. In production, `MONGODB_URI` and `JWT_SECRET` are required.

See Vercel's [Express deployment guide](https://vercel.com/docs/frameworks/backend/express) for project settings and runtime details.

# Clinical Imaging Review (frontend)

Static React UI for the `cancer_cells` API gateway: upload a scan, poll for completion, show classification and processed-output links.

## Local development

1. Start the backend stack (API reachable on **127.0.0.1:3000** on the host — loopback only):

   ```bash
   cd ..
   docker compose up -d
   ```

2. Install and run the dev server (proxies `/api` → `http://127.0.0.1:3000`):

   ```bash
   npm install
   npm run dev
   ```

3. Open **http://127.0.0.1:5173**.

## Production-style run (Docker Compose)

From the repository root:

```bash
docker compose up -d --build
```

- **Web UI:** http://localhost (default host port **80** via `FRONTEND_PORT` in `.env`; use `8080` if 80 is taken).
- **API from the browser:** same origin — `http://localhost/api/...` (nginx proxies to the gateway).
- **Direct gateway on the host:** `http://127.0.0.1:3000` only (Compose binds the gateway to loopback, not `0.0.0.0`).

The `frontend` container serves the built SPA with **nginx** and **reverse-proxies** `/api` and `/health` to `api_gateway`, so the browser uses one origin and uploads stay well below gateway limits (`client_max_body_size 55m`).

## Cloud deployment (outline)

| Piece | Typical approach |
|--------|------------------|
| Frontend | Build image `frontend/Dockerfile` or `npm run build` + host `dist/` behind nginx/CloudFront/OCI Object Storage static hosting. |
| API & workers | Existing Compose services map cleanly to **OCI Container Instances**, **Kubernetes**, or split VMs: gateway public; Kafka/Redis/Postgres internal/private. |
| TLS | Terminate HTTPS at load balancer or ingress; keep Kafka off the public internet. |
| Secrets | Inject `.env` via vault / OCI secrets; never commit keys. |
| Object URLs | Private buckets require **pre-signed URLs** or an authenticated proxy if browsers must display images without Oracle login. |

## Stack

- React 18 + TypeScript + Vite
- Layout and palette aimed at clinical intake screens (cream surfaces, muted teal accent, no decorative “AI” chrome).

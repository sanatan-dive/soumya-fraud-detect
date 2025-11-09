# Fraud Detection System — Viva Summary

This document explains the full project architecture, components, data flow, algorithms, APIs, and how to run/demo the system. Use it as your viva-ready script and quick reference.

## 1) What this project is

A full‑stack, near real‑time fraud detection demo that:

- Simulates card transactions in the browser and scores risk using a rule‑based “ML-like” model
- Streams/ingests transactions via Kafka (topic: `transactions`)
- Persists transactions and generated alerts in MongoDB
- Exposes REST APIs for ingestion, querying, alert review, and stats
- Provides a React dashboard to monitor risk, manage alerts, and visualize activity

## 2) Tech stack

- Frontend: React + TypeScript + Vite, `lucide-react` icons, custom CSS
- Backend: Node.js + Express, MongoDB via Mongoose, Kafka via `kafkajs`, `dotenv`, `cors`
- Infra (local): Docker Compose for Zookeeper, Kafka, MongoDB, and the backend

Key files:

- Frontend: `src/App.tsx`, `src/main.tsx`, `index.html`, styles in `src/FraudDetectionApp.css`
- Backend: `backend/server.js`, `backend/package.json`, `backend/Dockerfile`
- Orchestration: `docker-compose.yml`

## 3) High‑level architecture

1. Transaction source
   - Frontend can generate simulated transactions (Start Stream) and keep local state in `localStorage`.
   - External systems can POST real transactions to backend `/api/transactions` to be published to Kafka.
2. Kafka
   - Topic `transactions` carries incoming events.
3. Backend consumer (`server.js`)
   - Consumes `transactions` topic, computes a risk score with multiple indicators, stores to MongoDB.
   - Creates an Alert for medium/high/critical risk transactions.
4. MongoDB
   - Collections: `transactions`, `alerts` (defined via Mongoose schemas).
5. REST API (Express)
   - Query transactions, alerts, stats; update alert decisions; health check; password‑protected cleanup.
6. Frontend dashboard
   - Three tabs: Dashboard, Alert Management, Transaction Stream.
   - Locally simulates scoring for UI demo; can also call backend endpoints (e.g., cleanup).

## 4) Data model (MongoDB)

Transactions (`Transaction`):

- transactionId, accountId, amount, merchant, category
- location (object with city/country/lat/lon), mlScore (number), riskLevel (LOW/MEDIUM/HIGH/CRITICAL)
- fraudIndicators ([String]) and timestamp

Alerts (`Alert`):

- alertId, transactionId, transaction (raw object), mlScore ({ score }), riskLevel
- reasons (array of { code, message, explanation?, severity, impact })
- status (PENDING | APPROVED | BLOCKED | ESCALATED), assignedTo, reviewedAt, action, comments, createdAt

## 5) Fraud scoring logic (concept)

Backend scoring (in `backend/server.js`) evaluates a set of indicators:

- High‑risk geography/location
- CVV/AVS mismatches
- Unusual amount thresholds (50k / 100k INR)
- Suspicious merchants/categories
- Suspicious device (emulator/rooted/jailbroken)
- VPN/TOR usage
- Previous declines (card testing)
- New account age
- Night‑time activity

It accumulates a risk score ∈ [0,1] and maps to a risk level:

- CRITICAL (≥ 0.70), HIGH (≥ 0.50), MEDIUM (≥ 0.30), LOW otherwise

Frontend scoring (in `src/App.tsx`) mirrors this with a weighted model and detailed reason codes. Conceptually:

- Let features fᵢ ∈ [0,1] and weights wᵢ ∈ [0,1]
- Risk score S = min(1, Σ wᵢ · fᵢ)

The UI shows the final score, per‑feature contributions, and a human‑readable explanation.

## 6) Backend APIs

Base URL (local): `http://localhost:5000`

- POST `/api/transactions`

  - Body: transaction object (JSON). Publishes to Kafka topic `transactions`.
  - Returns `{ success: true }` on enqueue.

- GET `/api/transactions`

  - Returns latest transactions from MongoDB.

- GET `/api/alerts`

  - Returns latest alerts from MongoDB.

- PUT `/api/alerts/:alertId`

  - Body: `{ action, comments, assignedTo }`
  - Updates an alert’s review status and metadata.

- GET `/api/stats`

  - Returns counts: totalTransactions, totalAlerts, criticalAlerts, pendingAlerts, alertRate.

- DELETE `/api/cleanup/all` [Password protected]

  - Body: `{ password }` (current hardcoded password: `140301`)
  - Deletes all transactions and alerts in MongoDB.

- GET `/api/health`
  - Returns service info and timestamp.

## 7) Frontend UI walkthrough

- Header
  - Title + model/version label, live clock, Start/Stop Stream control.
- Tabs
  1. Dashboard
     - Stat cards: Total Transactions, Critical Alerts, Pending Review, Amount Blocked
     - Critical/High alert panel
     - Clear Database button (calls backend cleanup, then clears localStorage)
  2. Alert Management
     - Search + filter (ALL, PENDING, CRITICAL, HIGH, REVIEWED)
     - Alert list with risk badges, indicators count, quick facts
     - Detail panel: AI risk assessment text, score bar, indicators with explanations, full transaction details, feature contributions, and action buttons (Approve/Block/Escalate)
  3. Transaction Stream
     - Live list of recent simulated transactions with basic details
     - Informational cards: Kafka topics, ML model info, performance (UI labels)

Local persistence: `localStorage` keys `fraudDetection_transactions`, `fraudDetection_alerts`, `fraudDetection_profiles` allow the demo to persist across refreshes.

## 8) How data flows end‑to‑end

- Option A (sim/demo): Frontend generates a transaction → calculates features + score → possibly raises an in‑memory alert → displays in UI → persists to localStorage only.
- Option B (realistic): Client or external service POSTs a transaction to `/api/transactions` → backend produces to Kafka → consumer computes score and indicators → stores `Transaction` and maybe `Alert` in MongoDB → UI/analysts fetch data via REST APIs → analysts take action (PUT alerts).

## 9) Running the project locally

Note: Frontend and backend are separate. You can run either the lightweight UI‑only demo or the full stack (Kafka + MongoDB + backend) via Docker.

A) UI‑only demo (no backend needed)

1. Install deps at project root
2. Start Vite dev server

B) Full stack (Docker Compose)

1. Ensure Docker Desktop is running
2. From project root, build and start services

C) Backend only (without Docker)

1. Start MongoDB and Kafka locally (or point to remote services)
2. Configure env vars
3. Install and start backend

Optional: Recreate databases/clear state

- Use the Dashboard’s Clear Database button (prompts for password)
- Or call `DELETE /api/cleanup/all` with `{ "password": "140301" }`

Ports

- Frontend (Vite): 5173 (default)
- Backend: 5000
- Kafka broker: 9092 (Docker)
- MongoDB: 27017 (Docker)

## 10) Configuration and environment

Important environment variables (backend):

- `MONGODB_URI` e.g., `mongodb://localhost:27017/fraud_detection` or `mongodb://mongodb:27017/fraud_detection` in Docker
- `KAFKA_BROKERS` e.g., `localhost:9092`
- `PORT` backend HTTP port (default 5000)

Docker Compose (`docker-compose.yml`) provisions:

- `zookeeper`, `kafka`, `mongodb`, and the `backend` build from `./backend`.

Kafka env note

- Backend uses `process.env.KAFKA_BROKERS`, and `docker-compose.yml` sets `KAFKA_BROKERS: kafka:9092` to match.

## 11) Security and reliability notes (for viva)

- Cleanup endpoint is password protected but uses a hardcoded password in code → not production‑safe. Move to env vars + proper auth (JWT/OAuth) and authorization.
- CORS is open; restrict origins in production.
- No authentication on read/write APIs; add authN/Z and audit logging.
- Kafka consumer and Mongo connections should include retry/backoff and health/liveness probes.
- Input validation/sanitization should be added for API payloads.

## 12) Performance considerations

- Kafka decouples ingestion from processing; can scale consumers horizontally.
- MongoDB capped collections or TTL indexes could help manage storage for high volume streams.
- Batch writes or backpressure strategies may be needed at higher throughput.

## 13) Demo script (step‑by‑step)

1. Start the UI and show empty dashboard
2. Click "Start Stream" → watch transactions appear and alerts populate
3. Go to Alert Management → filter to CRITICAL/HIGH, open an alert
4. Show AI assessment, indicators, feature contributions, and take an action (Approve/Block/Escalate)
5. Use Clear Database to demonstrate backend cleanup integration (enter password `140301`)
6. (Optional) Post a custom transaction to `/api/transactions` and show it propagating to MongoDB/alerts/stats

## 14) Likely viva questions and answers

- Q: Why Kafka? A: It decouples producers from consumers, buffers spikes, and enables horizontal scaling and replay.
- Q: How is the fraud score computed? A: A weighted sum of domain indicators (CVV/AVS, geo, velocity, device, amount, etc.) with thresholds; score mapped to LOW/MEDIUM/HIGH/CRITICAL.
- Q: Where is state stored? A: UI demo uses localStorage; backend stores canonical state in MongoDB collections (`transactions`, `alerts`).
- Q: How do analysts act on alerts? A: Via PUT `/api/alerts/:alertId` with action and comments. The UI exposes Approve/Block/Escalate and records metadata.
- Q: What would you improve for production? A: Real trained model (e.g., ONNX/TF), feature store, model monitoring, proper authN/Z, RBAC, secured secrets, input validation, observability (metrics/tracing), and resilient infra (retries, DLQs).

## 15) Known limitations

- Frontend’s “ML model” is heuristic for demo; values like accuracy/throughput in UI are illustrative.
- No pagination on APIs; UI limits to recent N records.
- Hardcoded cleanup password; no user management.

## 16) Quick file map

- `src/App.tsx` — Entire dashboard UI, transaction generator, scoring, indicators, alert workflow
- `src/FraudDetectionApp.css` — All UI styling
- `backend/server.js` — Kafka producer/consumer, scoring, Mongo persistence, REST APIs
- `docker-compose.yml` — Local infra stack
- `backend/Dockerfile` — Containerizes backend

---

Prepared for viva on: 09 Nov 2025

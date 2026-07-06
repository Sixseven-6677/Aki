# Aki — Hybrid Facebook Messenger Bot

> **Sixsu × Nejin** — Two architectures merged into one engine

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AKI HYBRID ENGINE                        │
├─────────────────────────────────────────────────────────────────┤
│  From SIXSU (TypeScript)            From NEJIN (JavaScript)     │
│  ─────────────────────────          ─────────────────────────── │
│  • Bot lifecycle (ISystem)          • Djamel-FCA library        │
│  • Commands pipeline                • 20-layer protection:      │
│  • Plugins system                     stealth, keepAlive,       │
│  • MongoDB + Drizzle                  mqttHealthCheck,          │
│  • Cache + Scheduler                  humanTyping,              │
│  • Middleware stack                   naturalPresence,          │
│  • Context builder                    behaviorScheduler,        │
│  • Diagnostic monitor                 sessionRefresher…         │
│  • Security + Auth                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Core Files

| File | Description |
|------|-------------|
| `src/facebook/AkiTransport.ts` | Hybrid connection layer — Djamel-FCA + 20-layer protection |
| `src/facebook/AkiSender.ts` | Message sender with retry/timeout |
| `src/facebook/FcaEventAdapter.ts` | FCA events → Sixsu MessagingEntry |
| `src/bootstrap/bootstrapFacebook.ts` | Account bootstrap (single or dual) |
| `fca/` | Djamel-FCA library (copy here) |
| `src/protection/` | Nejin 20 protection layers |

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy Djamel-FCA into fca/
cp -r /path/to/djamel-fca/* fca/

# 3. Configure environment
cp .env.example .env
# Edit .env — add FB_APPSTATE (Facebook cookies)

# 4. Run
npm run dev       # development
npm start         # production (build first)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FB_APPSTATE` | ✅ | Facebook AppState cookies JSON |
| `SESSION_SECRET` | ✅ | Strong random secret (32+ chars) |
| `BOT_PREFIX` | ✅ | Command prefix (default: `/`) |
| `BOT_ADMIN_IDS` | ✅ | Comma-separated FB user IDs |
| `MONGODB_URI` | ❌ | MongoDB connection string |
| `NODE_ENV` | ❌ | `production` or `development` |

## Protection Layers (from Nejin)

The 20-layer protection system from Nejin runs automatically after login:
- **stealth** — anti-detection behavior
- **keepAlive** — keep MQTT connection alive
- **mqttHealthCheck** — monitor MQTT health
- **humanTyping** — simulate human typing patterns
- **naturalPresence** — natural online/offline presence
- **behaviorScheduler** — random activity scheduling
- **sessionRefresher** — automatic session refresh
- **Uprotection** — unified protection coordinator

## Multi-Account Support

```env
# Primary account
FB_APPSTATE=[{"key":"c_user","value":"..."}]

# Secondary account (optional)
FB_APPSTATE_2=[{"key":"c_user","value":"..."}]
```

## License

Private — All Rights Reserved

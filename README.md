# CulturePulse
### Brand Culture Intelligence · For Creative Professionals

> Live culture signal dashboard — Google Trends integration, Culture Drop alerts,
> Culture Fit scoring, Tension Library, and Pulse Report.

---

## Deploy in 5 steps

### Prerequisites
- [Node.js](https://nodejs.org) installed
- [Git](https://git-scm.com) installed
- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (free)

---

### Step 1 — Unzip this folder

```bash
unzip culturepulse-deploy.zip
cd culturepulse-deploy
```

---

### Step 2 — Push to GitHub

**Option A — GitHub CLI**
```bash
git init
git add .
git commit -m "feat: initial CulturePulse dashboard"
gh repo create culturepulse --public --source=. --remote=origin --push
```

**Option B — Manual**
```bash
# 1. Go to github.com/new → create repo "culturepulse"
# 2. Then:
git init
git add .
git commit -m "feat: initial CulturePulse dashboard"
git remote add origin https://github.com/YOUR_USERNAME/culturepulse.git
git branch -M main
git push -u origin main
```

---

### Step 3 — Install Vercel CLI

```bash
npm install -g vercel
```

---

### Step 4 — Login

```bash
vercel login
```

---

### Step 5 — Deploy

```bash
vercel --prod
```

First run questions:
| Question | Answer |
|---|---|
| Set up and deploy? | Y |
| Link to existing project? | N |
| Project name? | culturepulse |
| Directory? | ./ (Enter) |
| Override settings? | N |

Live at: `https://culturepulse.vercel.app`

---

## Auto-deploy on every push

After first deploy, every git push redeploys automatically:

```bash
git add .
git commit -m "your update message"
git push
```

Vercel detects the push → redeploys in ~20 seconds.

---

## Connect via Vercel dashboard (no CLI)

1. vercel.com/new → Import Git Repository
2. Select `culturepulse` repo
3. Deploy

Every `git push` to `main` = auto redeploy. PRs get preview URLs.

---

## File structure

```
culturepulse-deploy/
├── index.html     ← Complete dashboard (self-contained, ~91KB)
├── vercel.json    ← Routing config
├── package.json   ← Project metadata
├── .gitignore     ← Git ignore
├── deploy.sh      ← Quick deploy reference
└── README.md      ← This file
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML + CSS + JS |
| Charts | Chart.js (CDN) |
| Fonts | Syne + DM Mono (Google Fonts) |
| Hosting | Vercel static |
| AI backend (next) | FastAPI + Claude API |


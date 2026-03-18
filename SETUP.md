# Golf League — Setup Guide

## Prerequisites

- Node.js 22+ (https://nodejs.org/)
- A Supabase account (https://supabase.com) — free tier works fine
- A Vercel account (https://vercel.com) — free tier works fine
- The "Golf Scores" GitHub repository created and ready

---

## Step 1: Create a Supabase Project

1. Go to https://supabase.com and sign in.
2. Click **New Project**.
3. Give it a name (e.g. `golf-league`), choose a region close to you, set a database password, and click **Create new project**.
4. Wait ~2 minutes for the project to provision.

---

## Step 2: Run the Database Schema

1. In your Supabase project dashboard, click **SQL Editor** in the left sidebar.
2. Click **New Query**.
3. Open the file `supabase/schema.sql` in this project and paste the entire contents into the query editor.
4. Click **Run** (or press Ctrl+Enter).
5. You should see "Success. No rows returned." — the tables and policies are now created.

---

## Step 3: Get Your Supabase Credentials

1. In your Supabase dashboard, go to **Project Settings** → **API**.
2. Copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** key (a long JWT string)

---

## Step 4: Create the `.env` File

In the root of this project, create a file named `.env` (copy from `.env.example`):

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Replace the values with your actual Supabase URL and anon key.

> **Important:** Never commit `.env` to git. It is already in `.gitignore` by default in Vite projects.

---

## Step 5: Run Locally (Optional)

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

---

## Step 6: Push to GitHub & Deploy to Vercel

### Push to GitHub

1. Open a terminal in the `golf-league` folder.
2. Initialize git and push to your "Golf Scores" repo:

```bash
git init
git add .
git commit -m "Initial commit — golf league app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/Golf-Scores.git
git push -u origin main
```

> Replace `YOUR_USERNAME` with your actual GitHub username.

### Deploy to Vercel

1. Go to https://vercel.com and sign in.
2. Click **Add New Project**.
3. Click **Import Git Repository** and select your **Golf Scores** repo.
4. Vercel auto-detects Vite. Confirm the settings:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. **Before clicking Deploy**, scroll down to **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
6. Click **Deploy**.

Vercel will build and deploy automatically. From now on, every `git push` to `main` triggers a new deploy automatically.

### Update Supabase Auth URL

After Vercel gives you a URL (e.g. `https://golf-scores.vercel.app`):
1. In Supabase go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your Vercel URL
3. Add the same URL to **Redirect URLs**

---

## Step 7: Player Sign-Up Instructions

Share your Vercel URL with all players. Each player signs up individually:

1. Go to the app URL.
2. Click the **Sign Up** tab.
3. Enter your **full name**, **email**, and **password**.
4. Click **Create Account**.
5. Check your email for a confirmation link and click it.
6. Return to the app and sign in.

### Pre-loaded Players

The following players should sign up (they are pre-loaded conceptually — each must create their own account):

| Name | Role |
|------|------|
| Trey Tedford | Commissioner (Admin) |
| Zack Miller | Player |
| Dalton Stringer | Player |
| Adam Cho | Player |
| Matt Derise | Player |
| Bryan Ratcliff | Player |

### Commissioner Auto-Assignment

When **Trey Tedford** signs up (using the exact name "Trey Tedford"), the app automatically sets `is_commissioner = true` on his account. This gives access to the **Admin** panel in the top navigation bar, which allows:
- Managing player roles
- Viewing and managing all rounds
- Marking rounds complete or deleting them

---

## Supabase Auth Configuration (Important)

By default, Supabase requires email confirmation. You have two options:

**Option A: Disable email confirmation (easiest for a private group)**
1. In Supabase: **Authentication** → **Providers** → **Email**
2. Toggle **Confirm email** off.

**Option B: Keep confirmation enabled**
- Players must click the confirmation email before they can sign in.
- Make sure Supabase has your site URL configured under **Authentication** → **URL Configuration** → **Site URL**.

---

## Features Overview

| Feature | Description |
|---------|-------------|
| **Live Scorecards** | Enter scores hole-by-hole with +/- buttons; updates sync in real-time for all players |
| **Leaderboard** | In-round leaderboard showing net and gross scores |
| **Season Standings** | Handicapped avg, stroke avg, and money leaderboards |
| **Handicap System** | Auto-calculated from last 10 rounds (best differentials) |
| **Betting** | Stroke play, match play, 2v2 scramble, and quota bets per round |
| **Round History** | Browse all completed rounds with results |
| **Commissioner Panel** | Admin tools for managing players and rounds |

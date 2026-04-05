# Simple help: updating your live site (Vultr) without being “technical”

You do **not** need to understand Docker, GHCR, or compose. You need **one path that works** and optionally someone to do the scary steps **once**.

---

## What “deploy” means here

Your app runs on a **rented computer** (Vultr). “Deploy” = put the **newest code** on that computer and restart the app.

---

## Pick **one** way forward

### Option A — Easiest long-term: let GitHub press the button for you

After this is set up **one time**, you deploy by clicking **Run workflow** in GitHub (like pressing “Publish”).

**You need:**

1. A GitHub account that owns this repo.
2. Access to your Vultr server as **root** with **SSH** (your host may have set this up already).

**One-time setup (you + Cursor or a tech friend):**

1. Open the repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Add two **secrets** (names must match exactly):

   | Name | What to put |
   |------|-------------|
   | `VULTR_HOST` | Your server IP, e.g. `139.84.154.78` (numbers only, no `http://`) |
   | `VULTR_SSH_PRIVATE_KEY` | The **private** SSH key text (starts with `-----BEGIN … PRIVATE KEY-----`). **Never** post this in chat or email. |

3. If GitHub asks: the **public** image packages for this repo must be **readable** by the server, **or** someone puts a GitHub “token” on the server once (see Option B’s “GHCR login” in `docs/Deployment_Plan.md`).

**Every time you want to deploy:**

1. Merge your changes to the **`main`** branch and wait until the green **CI** workflow finishes (it builds the app images).
2. Go to **Actions** → **Deploy Vultr** → **Run workflow**.
3. Leave **image tag** as `latest` unless someone told you otherwise → **Run workflow**.

That’s it. If it turns red, copy the error text and paste it into Cursor: “this failed, what do I do?”

---

### Option B — You use Cursor to run one command from your Mac

If you’re not ready for GitHub secrets, you can still deploy from your laptop **if**:

- You can open **Terminal** (or use Cursor’s terminal), and  
- **SSH to the server works** (no password every time — usually a key was set up already).

**Steps:**

1. Open this project in Cursor.
2. Open the terminal in Cursor (`` Ctrl+` `` or **Terminal → New Terminal**).
3. Paste **one** line and press Enter (your tech helper fills in nothing if defaults match your server):

```bash
bash scripts/push-to-vultr.sh
```

That script:

- Copies the project to the server  
- Pulls the ready-built app from GitHub’s container registry (default)  
- Restarts the app  

**If the server has never logged in to GitHub’s registry**, the first pull might fail. Then say in Cursor: *“push-to-vultr failed on docker pull, help me fix GHCR login on the VPS”* — that’s a **one-time** fix.

**Old behavior** (build on the server — slower):

```bash
DEPLOY_MODE=build bash scripts/push-to-vultr.sh
```

---

### Option C — You don’t want to touch any of this

That’s valid. Save this paragraph for a contractor:

> “Repo is NexusOps. Production is Docker on Vultr at `/opt/nexusops`. Deploy is `bash scripts/push-to-vultr.sh` from the repo (pull mode) or GitHub Action `Deploy Vultr`. Postgres should stay on loopback; firewall script is `scripts/harden-vultr-firewall.sh`. Full notes: `docs/Deployment_Plan.md`.”

They can take it from there in an hour or two.

---

## If something breaks

1. **Don’t panic** — the old version often keeps running until a deploy succeeds.  
2. Copy the **exact error message** (or screenshot) into Cursor.  
3. Say: **“I’m not technical — explain like I’m five and give me the next single step.”**

---

## Chaos / “did we break production?” tests

Those are **optional** health checks. You do **not** need to run them to ship code. If you want them later, use `tests/chaos/CHAOS_SYSTEM_VALIDATION.md` with Cursor walking you through it.

---

*You’re not supposed to memorize this file — bookmark it and follow one option.*

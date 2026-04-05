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

#### Easiest: let a script push the secrets (no pasting keys into GitHub’s website)

I (Cursor / a helper) **cannot** log into GitHub in your browser for you. This script runs **on your Mac** and uploads the secrets via **GitHub’s official CLI** — you only sign in once in the browser when `gh` asks.

1. Install and log in (one time):

   `brew install gh`

   `gh auth login`  
   (pick GitHub.com → HTTPS → finish in the browser)

2. In Terminal, go to your NexusOps folder, then run (put **your** server IP):

   `export VULTR_HOST=139.84.154.78`

   `bash scripts/setup-github-vultr-secrets.sh`

   It picks `~/.ssh/id_ed25519` or `~/.ssh/id_rsa` automatically. If you have no key yet, the script tells you what to do.

**One-time setup (manual, if you don’t want `gh`):**

1. Open the repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Add two **secrets** (names must match exactly):

   | Name | What to put |
   |------|-------------|
   | `VULTR_HOST` | Your server IP, e.g. `139.84.154.78` (numbers only, no `http://`) |
   | `VULTR_SSH_PRIVATE_KEY` | The **private** SSH key text (starts with `-----BEGIN … PRIVATE KEY-----`). **Never** post this in chat or email. **Not** your root password — see below. |

#### “I don’t know where to find the private key” (Mac)

This is **not** your Vultr/root password. It’s a **file** on your Mac (or you create one once).

**Important:** In Terminal, paste **only the command line** — not the words `bash`, not lines with **\`\`\`**, not backticks. If you pasted a whole gray box from a doc and see `bash-3.2$` or errors, type **`exit`** and Enter until you’re back to a normal prompt, then try again.

**Step 1 — Look in your `.ssh` folder**

1. Open **Terminal** (Spotlight: type `Terminal`, Enter).
2. **Type or paste exactly this one line**, then press **Enter**:

   `ls -la ~/.ssh`

3. Look for a file named **`id_ed25519`** or **`id_rsa`** (no `.pub` on the end).  
   - **`id_ed25519.pub` / `id_rsa.pub`** = public → **do not** paste into GitHub for this secret.  
   - **`id_ed25519` / `id_rsa`** = private → **this** is what GitHub wants.

**Step 2 — Copy the private key into GitHub (carefully)**

1. Run **one** of these **one-line** commands (whichever matches the file you saw in Step 1), then press **Enter**:

   `cat ~/.ssh/id_ed25519`

   or

   `cat ~/.ssh/id_rsa`

2. Select **everything** printed, from `-----BEGIN` through `-----END …`.  
3. In GitHub: **Settings → Secrets and variables → Actions → New repository secret** → name `VULTR_SSH_PRIVATE_KEY` → paste → save.

**Do not** paste that output into ChatGPT, email, or Discord — treat it like a password.

**Step 3 — If `ls ~/.ssh` shows nothing useful (no `id_ed25519` / `id_rsa`)**

Then you don’t have a default key yet. Easiest path with a helper:

1. Create a new key — paste this **whole line** once, Enter (empty passphrase is fine for simple automation; you can change later):

   `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""`

2. Show the **public** half (safe to share with the server only — **not** the GitHub private-key secret):

   `cat ~/.ssh/id_ed25519.pub`

   Copy that **one line** (`ssh-ed25519 AAAA…`). On the server, it must be appended to **`/root/.ssh/authorized_keys`** (or ask Vultr / a friend to do that).

3. Test from your Mac: `ssh root@YOUR_SERVER_IP` — should work **without** typing your root password.

4. Then use **Step 2** with `cat ~/.ssh/id_ed25519` and paste into `VULTR_SSH_PRIVATE_KEY`.

**If you only ever use Vultr’s browser console** and never SSH from your Mac, you may not have a key on the Mac yet — Step 3 is exactly for that.

4. If GitHub asks: the **public** image packages for this repo must be **readable** by the server, **or** someone puts a GitHub “token” on the server once (see Option B’s “GHCR login” in `docs/Deployment_Plan.md`).

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
3. **First** `cd` into your NexusOps folder (where the project lives), then paste **this one line** and press Enter:

   `bash scripts/push-to-vultr.sh`

That script:

- Copies the project to the server  
- Pulls the ready-built app from GitHub’s container registry (default)  
- Restarts the app  

**If the server has never logged in to GitHub’s registry**, the first pull might fail. Then say in Cursor: *“push-to-vultr failed on docker pull, help me fix GHCR login on the VPS”* — that’s a **one-time** fix.

**Old behavior** (build on the server — slower):

`DEPLOY_MODE=build bash scripts/push-to-vultr.sh`

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

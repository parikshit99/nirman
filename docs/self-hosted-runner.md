# Building the app on the owner's PC

CI's app build (the `native` job: the APK, about 6 to 11 minutes on GitHub) can run on the owner's Windows 11 PC instead. For a public repository GitHub's runners are free too, so the gain is speed: the PC is faster when it has more cores than GitHub's runner (4), and its caches (Gradle, ccache, the Android SDK) stay on its disk instead of being downloaded every run. `test` and `publish` always stay on GitHub.

The job runs in Ubuntu inside WSL2, so the CI scripts work unchanged. Uploading caches to GitHub is skipped on a self-hosted runner (`runner.environment`).

## Switching between the PC and GitHub

The repository variable `NATIVE_RUNNER` decides where `native` runs (*Settings → Secrets and variables → Actions → Variables*):

| `NATIVE_RUNNER` | `native` runs on |
|---|---|
| `self-hosted` | The PC (runners labelled `nirman-pc`) |
| missing or anything else | GitHub's machines (`ubuntu-latest`) |

**While the PC is off or asleep, the build waits** (and fails after 24 hours), and nothing is published. Before a trip, delete the variable so CI goes back to GitHub.

**A pull request from a fork always builds on GitHub**, whatever `NATIVE_RUNNER` says: the repository is public, and a stranger's code must never run on the PC. See *Safety* for what keeps it that way.

## Setting up the PC (once)

### 1. WSL2 with Ubuntu 24.04 (PowerShell as administrator)

```powershell
wsl --install -d Ubuntu-24.04
```

Restart if asked, open *Ubuntu 24.04* from the Start menu and create your Linux user.

### 2. Keep WSL running (Windows side)

Create `%UserProfile%\.wslconfig` (e.g. `C:\Users\<you>\.wslconfig`):

```ini
[wsl2]
memory=24GB
vmIdleTimeout=-1
```

`memory` caps WSL so Windows stays usable during a build. Inside Ubuntu, turn on systemd so the runner can run as a service:

```bash
printf '[boot]\nsystemd=true\n' | sudo tee /etc/wsl.conf
```

Then in PowerShell: `wsl --shutdown`, and open Ubuntu again.

WSL stops when nothing is using it. To keep it running whenever you are logged in to Windows, add a task in *Task Scheduler*: trigger *At log on*, action `wsl.exe` with arguments `-d Ubuntu-24.04 --exec sleep infinity`, and tick *Run whether user is logged on or not* only if you want CI while logged out. Also set Windows not to sleep while plugged in (*Settings → System → Power*).

### 3. Install the build tools (inside Ubuntu)

```bash
git clone https://github.com/parikshit99/nirman.git ~/nirman-setup
bash ~/nirman-setup/.github/scripts/setup-wsl-runner.sh
```

It installs Java 17, ccache and the Android SDK. At the end it prints four lines for step 4.

### 4. Register the runner (inside Ubuntu)

On GitHub: *Settings → Actions → Runners → New self-hosted runner → Linux, x64*. It shows the download commands and a one-time token. Run them in `~/actions-runner-1`, and configure with:

```bash
./config.sh --url https://github.com/parikshit99/nirman --token <token from the page> --name nirman-pc-1 --labels nirman-pc --unattended
```

Put the four lines printed in step 3 into `~/actions-runner-1/.env`, then install it as a service so it starts with WSL:

```bash
sudo ./svc.sh install && sudo ./svc.sh start
```

### 5. Switch CI to the PC

Add the repository variable `NATIVE_RUNNER` = `self-hosted` (*Settings → Secrets and variables → Actions → Variables → New repository variable*). The next build runs on the PC; the runner shows as *Active* under *Settings → Actions → Runners*.

## Safety

The repository is public, so anyone can fork it and open a pull request. Two guards keep a stranger's code off the PC; keep both:
- **CI sends only this repository's own runs to the PC:** pushes to `main`, manual runs and pull requests from its own branches. A pull request from a fork builds on GitHub's machines (`ci.yml`, the `runs-on` of `native`). CI uses the `pull_request` trigger. Never add `pull_request_target`: it runs for a fork's pull request without approval, and this check would send that run to the PC.
- **A fork's pull request runs only once you approve it.** It can change `ci.yml` itself, this check included. Keep *Settings → Actions → General → Approval for running fork pull request workflows from contributors* on *Require approval for all external contributors*, and approve a run only after checking that the pull request changes nothing in `.github/`.

On the PC:
- The release signing key reaches it as a repo secret during a build, is written to the runner's temporary folder for signing, and is deleted straight after (`.github/scripts/sign-apk.sh`).
- The runners run as your WSL user, inside WSL, not as a Windows administrator.

## Removing it

Delete `NATIVE_RUNNER`. Then in the runner folder: `sudo ./svc.sh uninstall` and `./config.sh remove --token <token from Settings → Actions → Runners>`.

# Windows on-premise installer track

The current testable payload is created from the repository root with:

```powershell
npm run package:onprem
```

It produces `onprem-dist/`, containing the standalone POS server, static assets, public assets, local environment template, and test instructions.

## Build the one-file Windows installer

On a Windows build machine with Inno Setup installed:

1. Copy the signed Windows Node runtime to `installer/windows/payload/node/node.exe`.
2. Copy the matching PostgreSQL Windows binaries to `installer/windows/payload/postgresql/`.
3. Run `npm run package:onprem` on the project first.
4. Run `installer/windows/build-installer.ps1`, or open `installer/windows/TOVAPOS-OnPremise.iss` in Inno Setup and compile it.

The result is `installer-output/TOVAPOS-OnPremise-Setup.exe`. The installer initializes a local PostgreSQL data directory, registers its service, creates the database, writes local-only environment settings, opens the private-LAN firewall port, and creates a server shortcut.

See [INSTALLER_UX.md](./INSTALLER_UX.md) for the required branded, guided experience and recovery rules. The current source is the installation foundation; the final wizard pages for new-business setup, restore preview, backup scheduling, and LAN verification are the next packaging layer.

The next installer layer will package this payload together with PostgreSQL and automate:

- first-run database/user creation;
- local business-owner setup;
- Windows Firewall LAN rule for the selected port;
- Start Menu/Desktop shortcuts;
- scheduled local backups;
- restore and update flows.

Do not point this test payload at the live Render database. Use a disposable local database or a restored staging copy.

The repository currently contains the installer source, not the final `.exe`, because Windows Node/PostgreSQL binaries and the Inno Setup compiler are not present in this Linux workspace.

## One-command Windows build

On a Windows computer with this project available, open PowerShell in the project folder and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\installer\windows\build-final-installer.ps1
```

The script downloads the official Windows runtimes and Inno Setup compiler, prepares the payload, and creates `installer-output\TOVAPOS-OnPremise-Setup.exe`. It does not use Render credentials or the live database.

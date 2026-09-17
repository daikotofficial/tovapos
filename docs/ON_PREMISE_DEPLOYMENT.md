# On-premise deployment track

The on-premise version is an additive deployment target. The online/Render deployment remains the default unless `DEPLOYMENT_MODE=onprem` is explicitly set.

On-premise installations are licensed by the one-time implementation/license agreement. They do not use the online monthly subscription gate or online product limits. User roles and permissions still apply, and the local license/install identity will be handled by the installer phase.

## Target experience

The installer will place the POS application and PostgreSQL on one local server computer. Cashier computers will open the server's LAN address in a browser. The database and operational records remain on that server.

## Current foundation

- `npm run build:onprem` creates a Next standalone build.
- `.env.onprem.example` documents the local runtime settings.
- `npm run backup:onprem` creates a PostgreSQL custom-format backup in `ONPREM_BACKUP_DIR`.

## First implementation boundary

This track does not change Render variables, the default Next build, cloud database behavior, or the online storage driver. Installer packaging, first-run setup, restore tooling, LAN firewall rules, and update signing will be added after the standalone build is verified.

## Backup rule

Backups must be copied to a second physical location. A backup stored only on the same server does not protect against disk failure, theft, or ransomware. Restore testing is required before an installation is considered production-ready.

# TOVAPOS installer experience

The final Windows installer is designed as one guided `.exe`, not a sequence of technical installers.

## Guided steps

1. **Welcome** — branded TOVAPOS screen, plain-language explanation, server-computer requirement, and a link to the support guide.
2. **Installation type** — choose `Start a new local business` or `Restore an existing TOVAPOS backup`.
3. **Business setup** — business name, owner name, email/phone, and a clear Retail/Product or Hospitality/Service choice. The choice is written to the same settings record used by normal onboarding.
4. **Database** — PostgreSQL is installed and initialized automatically. The user sees what is happening; passwords are generated and stored locally with restricted permissions.
5. **Restore** — file picker, backup validation, database compatibility check, record summary, explicit confirmation, and a protected rollback point before replacement.
6. **Network access** — show the local server address, selected port, private-network firewall explanation, and a copy button for cashier computers.
7. **Backups** — choose a backup folder, optional second destination, schedule, retention count, and a test-backup button.
8. **Finish** — health check, database check, backup status, browser launch, and a printable/ copyable LAN access instruction.

## Reliability rules

- The installer is restartable and does not reinitialize a healthy existing database.
- Database initialization and restore use temporary work locations and explicit success checks.
- A restore never overwrites the active database without a verified backup/rollback point.
- Secrets are never shown in installer logs or browser-visible configuration.
- A failed step stops with a useful explanation and a retry path.
- The app is not advertised as ready until `/api/health` reports both application and database health.

## Branding

The current TOVAPOS favicon is used as the installer icon. A dedicated high-resolution installer artwork can be added later without changing the deployment logic.


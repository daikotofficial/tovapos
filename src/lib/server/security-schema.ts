import { randomUUID } from 'node:crypto';
import { hashPasswordServer } from './password';
import { getPosPool } from './pos-db';

let securitySchemaReady: Promise<void> | null = null;

export async function ensureSecuritySchema(): Promise<void> {
  if (!securitySchemaReady) {
    securitySchemaReady = getPosPool()
      .query(
        `
        CREATE TABLE IF NOT EXISTS pos_tenants (
          id text PRIMARY KEY,
          slug text NOT NULL UNIQUE,
          name text NOT NULL,
          registration_number text,
          phone text NOT NULL DEFAULT '',
          address text NOT NULL DEFAULT '',
          status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS pos_app_users (
          tenant_id text NOT NULL REFERENCES pos_tenants(id) ON DELETE CASCADE,
          id text NOT NULL,
          name text NOT NULL,
          email text NOT NULL,
          phone text NOT NULL DEFAULT '',
          role text NOT NULL,
          permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
          status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
          branch text,
          pin_hash text,
          password_hash text NOT NULL,
          password_updated_at timestamptz,
          last_login timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (tenant_id, id),
          UNIQUE (tenant_id, email)
        );

        CREATE INDEX IF NOT EXISTS pos_app_users_email_idx
          ON pos_app_users (lower(email));

        CREATE OR REPLACE FUNCTION enforce_pos_app_users_global_email_unique()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $unique_email$
        BEGIN
          NEW.email := lower(trim(NEW.email));
          IF TG_OP = 'UPDATE' AND lower(OLD.email) = NEW.email THEN
            RETURN NEW;
          END IF;
          IF EXISTS (
            SELECT 1
            FROM pos_app_users existing
            WHERE lower(existing.email) = NEW.email
              AND NOT (existing.tenant_id = NEW.tenant_id AND existing.id = NEW.id)
          ) THEN
            RAISE EXCEPTION 'Email address is already assigned to another account'
              USING ERRCODE = '23505',
                    CONSTRAINT = 'pos_app_users_global_email_unique';
          END IF;
          RETURN NEW;
        END;
        $unique_email$;

        DROP TRIGGER IF EXISTS pos_app_users_global_email_unique ON pos_app_users;
        CREATE TRIGGER pos_app_users_global_email_unique
          BEFORE INSERT OR UPDATE OF email ON pos_app_users
          FOR EACH ROW EXECUTE FUNCTION enforce_pos_app_users_global_email_unique();

        ALTER TABLE pos_app_users
          ADD COLUMN IF NOT EXISTS email_verified_at timestamptz DEFAULT now();

        CREATE TABLE IF NOT EXISTS pos_sessions (
          id text PRIMARY KEY,
          tenant_id text NOT NULL,
          user_id text NOT NULL,
          token_hash text NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          last_seen_at timestamptz NOT NULL DEFAULT now(),
          FOREIGN KEY (tenant_id, user_id)
            REFERENCES pos_app_users(tenant_id, id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS pos_sessions_expiry_idx ON pos_sessions (expires_at);

        CREATE TABLE IF NOT EXISTS pos_password_reset_tokens (
          id text PRIMARY KEY,
          tenant_id text NOT NULL,
          user_id text NOT NULL,
          token_hash text NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL,
          used_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          FOREIGN KEY (tenant_id, user_id)
            REFERENCES pos_app_users(tenant_id, id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS pos_password_reset_tokens_user_idx
          ON pos_password_reset_tokens (tenant_id, user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS pos_password_reset_tokens_expiry_idx
          ON pos_password_reset_tokens (expires_at);

        CREATE TABLE IF NOT EXISTS pos_email_verification_tokens (
          id text PRIMARY KEY,
          tenant_id text NOT NULL,
          user_id text NOT NULL,
          token_hash text NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL,
          used_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          FOREIGN KEY (tenant_id, user_id)
            REFERENCES pos_app_users(tenant_id, id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS pos_email_verification_tokens_user_idx
          ON pos_email_verification_tokens (tenant_id, user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS pos_email_verification_tokens_expiry_idx
          ON pos_email_verification_tokens (expires_at);

        CREATE TABLE IF NOT EXISTS pos_auth_attempts (
          attempt_key text PRIMARY KEY,
          failures integer NOT NULL DEFAULT 0,
          blocked_until timestamptz,
          last_attempt_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS pos_platform_admins (
          id text PRIMARY KEY,
          name text NOT NULL,
          email text NOT NULL UNIQUE,
          role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'support')),
          status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
          password_hash text,
          invited_by text,
          invited_at timestamptz,
          accepted_at timestamptz,
          last_login timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS pos_platform_admin_sessions (
          id text PRIMARY KEY,
          admin_id text NOT NULL REFERENCES pos_platform_admins(id) ON DELETE CASCADE,
          token_hash text NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          last_seen_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS pos_platform_admin_invites (
          id text PRIMARY KEY,
          admin_id text NOT NULL REFERENCES pos_platform_admins(id) ON DELETE CASCADE,
          token_hash text NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL,
          used_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS pos_platform_admin_sessions_expiry_idx
          ON pos_platform_admin_sessions (expires_at);
        CREATE INDEX IF NOT EXISTS pos_platform_admin_invites_expiry_idx
          ON pos_platform_admin_invites (expires_at);

        CREATE TABLE IF NOT EXISTS pos_support_tickets (
          id text PRIMARY KEY,
          tenant_id text NOT NULL REFERENCES pos_tenants(id) ON DELETE CASCADE,
          subject text NOT NULL,
          message text NOT NULL,
          status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
          priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
          created_by text NOT NULL,
          created_by_email text,
          response text,
          responded_by text,
          responded_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS pos_support_tickets_tenant_status_idx
          ON pos_support_tickets (tenant_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS pos_support_tickets_status_idx
          ON pos_support_tickets (status, created_at DESC);

        CREATE TABLE IF NOT EXISTS pos_expiry_digest_runs (
          tenant_id text NOT NULL REFERENCES pos_tenants(id) ON DELETE CASCADE,
          scheduled_week date NOT NULL,
          status text NOT NULL CHECK (status IN ('processing', 'sent', 'skipped', 'failed')),
          item_count integer NOT NULL DEFAULT 0,
          recipient_count integer NOT NULL DEFAULT 0,
          error_message text,
          started_at timestamptz NOT NULL DEFAULT now(),
          finished_at timestamptz,
          PRIMARY KEY (tenant_id, scheduled_week)
        );

        CREATE INDEX IF NOT EXISTS pos_expiry_digest_runs_status_idx
          ON pos_expiry_digest_runs (status, scheduled_week DESC);

        CREATE TABLE IF NOT EXISTS pos_tenant_records (
          tenant_id text NOT NULL REFERENCES pos_tenants(id) ON DELETE CASCADE,
          store_name text NOT NULL,
          record_id text NOT NULL,
          data jsonb NOT NULL,
          version bigint NOT NULL DEFAULT 1,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (tenant_id, store_name, record_id)
        );

        CREATE INDEX IF NOT EXISTS pos_tenant_records_store_idx
          ON pos_tenant_records (tenant_id, store_name, updated_at DESC);

        CREATE TABLE IF NOT EXISTS pos_tenant_inventory (
          tenant_id text NOT NULL REFERENCES pos_tenants(id) ON DELETE CASCADE,
          id text NOT NULL,
          name text NOT NULL,
          generic_name text NOT NULL DEFAULT '',
          sku text NOT NULL,
          barcode text,
          category text NOT NULL DEFAULT '',
          supplier text NOT NULL DEFAULT '',
          batch_lot text NOT NULL DEFAULT '',
          current_qty numeric NOT NULL DEFAULT 0 CHECK (current_qty >= 0),
          reorder_level numeric NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
          unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
          selling_price numeric NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
          expiry_date date,
          product_status text NOT NULL DEFAULT 'active',
          stock_status text NOT NULL DEFAULT 'in-stock',
          version bigint NOT NULL DEFAULT 1,
          data jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (tenant_id, id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS pos_tenant_inventory_sku_unique_idx
          ON pos_tenant_inventory (tenant_id, lower(sku)) WHERE sku <> '';
        CREATE UNIQUE INDEX IF NOT EXISTS pos_tenant_inventory_barcode_unique_idx
          ON pos_tenant_inventory (tenant_id, lower(barcode))
          WHERE barcode IS NOT NULL AND barcode <> '';
        CREATE INDEX IF NOT EXISTS pos_tenant_inventory_name_idx
          ON pos_tenant_inventory (tenant_id, lower(name), id);
        CREATE INDEX IF NOT EXISTS pos_tenant_inventory_filter_idx
          ON pos_tenant_inventory (tenant_id, category, supplier, stock_status);
        CREATE INDEX IF NOT EXISTS pos_tenant_inventory_search_idx
          ON pos_tenant_inventory USING gin (
            to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(generic_name, '') || ' ' ||
              coalesce(sku, '') || ' ' || coalesce(barcode, '') || ' ' || coalesce(batch_lot, ''))
          );

        CREATE TABLE IF NOT EXISTS pos_tenant_sales (
          tenant_id text NOT NULL REFERENCES pos_tenants(id) ON DELETE CASCADE,
          id text NOT NULL,
          transaction_id text NOT NULL,
          timestamp timestamptz NOT NULL,
          cashier text NOT NULL DEFAULT '',
          customer_name text,
          status text NOT NULL DEFAULT 'completed',
          payment_method text NOT NULL DEFAULT 'cash',
          payment_status text,
          subtotal numeric NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
          discount_total numeric NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
          tax_amount numeric NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
          grand_total numeric NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
          amount_paid numeric NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
          amount_due numeric NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
          gross_profit numeric NOT NULL DEFAULT 0,
          item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
          data jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (tenant_id, id),
          UNIQUE (tenant_id, transaction_id)
        );

        CREATE INDEX IF NOT EXISTS pos_tenant_sales_timestamp_idx
          ON pos_tenant_sales (tenant_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS pos_tenant_sales_status_idx
          ON pos_tenant_sales (tenant_id, status, timestamp DESC);

        CREATE TABLE IF NOT EXISTS pos_tenant_sale_items (
          tenant_id text NOT NULL,
          id text NOT NULL,
          sale_id text NOT NULL,
          inventory_item_id text NOT NULL,
          product_name text NOT NULL DEFAULT '',
          sku text NOT NULL DEFAULT '',
          category text NOT NULL DEFAULT '',
          quantity numeric NOT NULL CHECK (quantity > 0),
          unit_price numeric NOT NULL CHECK (unit_price >= 0),
          unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
          discount numeric NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= 100),
          line_total numeric NOT NULL CHECK (line_total >= 0),
          gross_profit numeric NOT NULL DEFAULT 0,
          sold_at timestamptz NOT NULL,
          data jsonb NOT NULL,
          PRIMARY KEY (tenant_id, id),
          FOREIGN KEY (tenant_id, sale_id)
            REFERENCES pos_tenant_sales(tenant_id, id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS pos_tenant_sale_items_product_idx
          ON pos_tenant_sale_items (tenant_id, inventory_item_id, sold_at DESC);
        CREATE INDEX IF NOT EXISTS pos_tenant_sale_items_category_idx
          ON pos_tenant_sale_items (tenant_id, category, sold_at DESC);

        CREATE TABLE IF NOT EXISTS pos_tenant_expenses (
          tenant_id text NOT NULL REFERENCES pos_tenants(id) ON DELETE CASCADE,
          id text NOT NULL,
          expense_id text NOT NULL,
          title text NOT NULL DEFAULT '',
          category text NOT NULL DEFAULT '',
          amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
          payment_method text NOT NULL DEFAULT 'cash',
          vendor_name text,
          recorded_by text NOT NULL DEFAULT '',
          status text NOT NULL DEFAULT 'recorded',
          incurred_at date NOT NULL,
          data jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (tenant_id, id),
          UNIQUE (tenant_id, expense_id)
        );

        CREATE INDEX IF NOT EXISTS pos_tenant_expenses_date_idx
          ON pos_tenant_expenses (tenant_id, incurred_at DESC);

        CREATE TABLE IF NOT EXISTS pos_idempotency_keys (
          tenant_id text NOT NULL REFERENCES pos_tenants(id) ON DELETE CASCADE,
          idempotency_key text NOT NULL,
          operation_type text NOT NULL,
          request_hash text NOT NULL,
          response_status integer,
          response_body jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz,
          PRIMARY KEY (tenant_id, idempotency_key)
        );

        CREATE TABLE IF NOT EXISTS pos_receipt_sequences (
          tenant_id text PRIMARY KEY REFERENCES pos_tenants(id) ON DELETE CASCADE,
          next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0)
        );

        CREATE TABLE IF NOT EXISTS pos_audit_log (
          tenant_id text NOT NULL REFERENCES pos_tenants(id) ON DELETE CASCADE,
          id bigserial PRIMARY KEY,
          user_id text,
          action text NOT NULL,
          entity_type text NOT NULL,
          entity_id text,
          operation_id text,
          before_data jsonb,
          after_data jsonb,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS pos_audit_log_tenant_time_idx
          ON pos_audit_log (tenant_id, created_at DESC);

        INSERT INTO pos_tenants (id, slug, name, status)
        VALUES ('tenant-legacy', 'legacy', 'Legacy TOVAPOS Business', 'active')
        ON CONFLICT (id) DO NOTHING;

        UPDATE pos_tenants
        SET name = 'Legacy TOVAPOS Business', updated_at = now()
        WHERE id = 'tenant-legacy' AND name = 'Legacy TOVAPOS Workspace';

        DELETE FROM pos_sessions WHERE expires_at <= now();
        DELETE FROM pos_password_reset_tokens
          WHERE expires_at <= now() OR used_at < now() - interval '24 hours';
        DELETE FROM pos_email_verification_tokens
          WHERE expires_at <= now() OR used_at < now() - interval '24 hours';
        DELETE FROM pos_auth_attempts WHERE last_attempt_at < now() - interval '24 hours';
      `
      )
      .then(async () => {
        const pool = getPosPool();
        const seedEmail = (
          process.env.PLATFORM_ADMIN_EMAIL || 'admin@tovapos.com.ng'
        ).toLowerCase();
        const seedName = process.env.PLATFORM_ADMIN_NAME || 'TOVAPOS Admin';
        const seedPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'AdminisHere123!';
        const existingSeed = await pool.query(
          'SELECT id, password_hash FROM pos_platform_admins WHERE lower(email) = $1 LIMIT 1',
          [seedEmail]
        );
        if (!existingSeed.rows[0]) {
          await pool.query(
            `INSERT INTO pos_platform_admins (id, name, email, role, status, password_hash, accepted_at)
             VALUES ($1, $2, $3, 'owner', 'active', $4, now())`,
            [
              `platform-admin-${randomUUID()}`,
              seedName,
              seedEmail,
              await hashPasswordServer(seedPassword),
            ]
          );
        } else if (!existingSeed.rows[0].password_hash) {
          await pool.query(
            `UPDATE pos_platform_admins
             SET password_hash = $2, status = 'active', accepted_at = coalesce(accepted_at, now()), updated_at = now()
             WHERE id = $1`,
            [existingSeed.rows[0].id, await hashPasswordServer(seedPassword)]
          );
        }

        const legacyExists = await pool.query(
          "SELECT to_regclass('public.pos_records') AS table_name"
        );
        if (!legacyExists.rows[0]?.table_name) return;

        await pool.query(`
          INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data, created_at, updated_at)
          SELECT 'tenant-legacy', store_name, record_id, data, created_at, updated_at
          FROM pos_records
          ON CONFLICT (tenant_id, store_name, record_id) DO NOTHING
        `);

        await pool.query(`
          INSERT INTO pos_app_users (
            tenant_id, id, name, email, phone, role, permissions, status, branch,
            pin_hash, password_hash, password_updated_at, last_login, created_at, updated_at
          )
          SELECT
            'tenant-legacy',
            record_id,
            coalesce(data->>'name', 'Legacy user'),
            lower(data->>'email'),
            coalesce(data->>'phone', ''),
            coalesce(data->>'role', 'cashier'),
            coalesce(data->'permissions', '[]'::jsonb),
            coalesce(data->>'status', 'active'),
            nullif(data->>'branch', ''),
            NULL,
            'pbkdf2-sha256$120000$' || (data->>'passwordSalt') || '$' || (data->>'passwordHash'),
            nullif(data->>'passwordUpdatedAt', '')::timestamptz,
            nullif(data->>'lastLogin', '')::timestamptz,
            coalesce(nullif(data->>'createdAt', '')::timestamptz, created_at),
            coalesce(nullif(data->>'updatedAt', '')::timestamptz, updated_at)
          FROM pos_records
          WHERE store_name = 'users'
            AND nullif(data->>'email', '') IS NOT NULL
            AND nullif(data->>'passwordHash', '') IS NOT NULL
            AND nullif(data->>'passwordSalt', '') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM pos_app_users existing
              WHERE lower(existing.email) = lower(data->>'email')
                AND NOT (
                  existing.tenant_id = 'tenant-legacy' AND existing.id = pos_records.record_id
                )
            )
          ON CONFLICT (tenant_id, id) DO NOTHING
        `);

        const legacyInventory = await pool.query(
          "SELECT to_regclass('public.pos_inventory') AS table_name"
        );
        if (legacyInventory.rows[0]?.table_name) {
          await pool.query(`
            INSERT INTO pos_tenant_inventory (
              tenant_id, id, name, generic_name, sku, barcode, category, supplier, batch_lot,
              current_qty, reorder_level, unit_cost, selling_price, expiry_date, product_status,
              stock_status, data, created_at, updated_at
            )
            SELECT
              'tenant-legacy', id, name, generic_name, sku, barcode, category, supplier, batch_lot,
              greatest(current_qty, 0), greatest(reorder_level, 0), greatest(unit_cost, 0),
              greatest(selling_price, 0), expiry_date, product_status, stock_status, data,
              created_at, updated_at
            FROM pos_inventory
            ON CONFLICT (tenant_id, id) DO NOTHING
          `);
        }

        const legacySales = await pool.query(
          "SELECT to_regclass('public.pos_sales') AS table_name"
        );
        if (legacySales.rows[0]?.table_name) {
          await pool.query(`
            INSERT INTO pos_tenant_sales (
              tenant_id, id, transaction_id, timestamp, cashier, customer_name, status,
              payment_method, payment_status, subtotal, discount_total, tax_amount, grand_total,
              amount_paid, amount_due, gross_profit, item_count, data, created_at, updated_at
            )
            SELECT
              'tenant-legacy', id, transaction_id, timestamp, cashier, customer_name, status,
              payment_method, payment_status, greatest(subtotal, 0), greatest(discount_total, 0),
              greatest(tax_amount, 0), greatest(grand_total, 0), greatest(amount_paid, 0),
              greatest(amount_due, 0), gross_profit, greatest(item_count, 0), data, created_at, updated_at
            FROM pos_sales
            ON CONFLICT (tenant_id, id) DO NOTHING
          `);
        }

        const legacySaleItems = await pool.query(
          "SELECT to_regclass('public.pos_sale_items') AS table_name"
        );
        if (legacySaleItems.rows[0]?.table_name) {
          await pool.query(`
            INSERT INTO pos_tenant_sale_items (
              tenant_id, id, sale_id, inventory_item_id, product_name, sku, category, quantity,
              unit_price, unit_cost, discount, line_total, gross_profit, sold_at, data
            )
            SELECT
              'tenant-legacy', i.id, i.sale_id, i.inventory_item_id, i.product_name, i.sku,
              i.category, i.quantity, greatest(i.unit_price, 0), greatest(i.unit_cost, 0),
              greatest(least(i.discount, 100), 0), greatest(i.line_total, 0), i.gross_profit,
              i.sold_at, i.data
            FROM pos_sale_items i
            JOIN pos_tenant_sales s ON s.tenant_id = 'tenant-legacy' AND s.id = i.sale_id
            WHERE i.quantity > 0
            ON CONFLICT (tenant_id, id) DO NOTHING
          `);
        }

        const legacyExpenses = await pool.query(
          "SELECT to_regclass('public.pos_expenses') AS table_name"
        );
        if (legacyExpenses.rows[0]?.table_name) {
          await pool.query(`
            INSERT INTO pos_tenant_expenses (
              tenant_id, id, expense_id, title, category, amount, payment_method, vendor_name,
              recorded_by, status, incurred_at, data, created_at, updated_at
            )
            SELECT
              'tenant-legacy', id, expense_id, title, category, greatest(amount, 0), payment_method,
              vendor_name, recorded_by, status, incurred_at, data, created_at, updated_at
            FROM pos_expenses
            ON CONFLICT (tenant_id, id) DO NOTHING
          `);
        }
      })
      .then(() => undefined)
      .catch((error) => {
        securitySchemaReady = null;
        throw error;
      });
  }

  await securitySchemaReady;
}

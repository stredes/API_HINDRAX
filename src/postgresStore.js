import pg from "pg";

const { Pool } = pg;

function normalizeTime(item) {
  return {
    ...item,
    updatedAt: item.updatedAt ?? Date.now()
  };
}

function fromRow(row) {
  return row.payload;
}

export class PostgresStore {
  constructor(databaseUrl) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    });
    this.ready = this.ensureSchema();
  }

  async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS hindrax_sync_records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        payload JSONB NOT NULL,
        PRIMARY KEY (collection, id)
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS hindrax_sync_records_cursor_idx
      ON hindrax_sync_records (collection, updated_at);
    `);
  }

  async upsertTask(task) {
    return this.upsert("tasks", task);
  }

  async listTasks({ updatedAfter = 0 } = {}) {
    return this.list("tasks", updatedAfter);
  }

  async upsertInventory(item) {
    return this.upsert("inventory", item);
  }

  async listInventory({ updatedAfter = 0 } = {}) {
    return this.list("inventory", updatedAfter);
  }

  async upsertDevice(device) {
    return this.upsert("devices", {
      id: device.deviceId,
      ...device
    });
  }

  async listDevices() {
    return this.list("devices", 0);
  }

  async upsert(collection, rawItem) {
    await this.ready;
    const item = normalizeTime(rawItem);
    const response = await this.pool.query(
      `
        INSERT INTO hindrax_sync_records (collection, id, updated_at, payload)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (collection, id)
        DO UPDATE SET updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload
        WHERE hindrax_sync_records.updated_at <= EXCLUDED.updated_at
        RETURNING payload;
      `,
      [collection, item.id, item.updatedAt, JSON.stringify(item)]
    );

    if (response.rows.length > 0) {
      return { item: fromRow(response.rows[0]), stored: true };
    }

    const current = await this.pool.query(
      `
        SELECT payload
        FROM hindrax_sync_records
        WHERE collection = $1 AND id = $2
        LIMIT 1;
      `,
      [collection, item.id]
    );
    return { item: fromRow(current.rows[0]), stored: false };
  }

  async list(collection, updatedAfter) {
    await this.ready;
    const response = await this.pool.query(
      `
        SELECT payload
        FROM hindrax_sync_records
        WHERE collection = $1 AND updated_at > $2
        ORDER BY updated_at ASC, id ASC;
      `,
      [collection, updatedAfter]
    );
    return response.rows.map(fromRow);
  }
}

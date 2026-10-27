exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE api_idempotency_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_.:-]{8,128}$'),
      method text NOT NULL CHECK (method IN ('POST','PUT','PATCH','DELETE')),
      request_path text NOT NULL,
      request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
      response_status integer CHECK (response_status BETWEEN 200 AND 499),
      response_body jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      expires_at timestamptz NOT NULL,
      UNIQUE (idempotency_key, method, request_path),
      CHECK ((response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
        OR (response_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL))
    );
    CREATE INDEX api_idempotency_expiry_idx ON api_idempotency_records(expires_at);
  `);
};

exports.down = (pgm) => pgm.dropTable('api_idempotency_records');

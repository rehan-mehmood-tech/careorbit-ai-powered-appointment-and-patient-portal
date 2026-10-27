exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE sessions ADD COLUMN parent_session_id uuid REFERENCES sessions(id) ON DELETE SET NULL;
    ALTER TABLE sessions ADD COLUMN replaced_by_session_id uuid REFERENCES sessions(id) ON DELETE SET NULL;
    ALTER TABLE sessions ADD COLUMN last_used_at timestamptz;
    CREATE INDEX sessions_family_idx ON sessions(family_id, created_at);

    CREATE TABLE auth_throttle_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      action text NOT NULL,
      identifier_hash char(64) NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      CHECK (action IN ('register','login','refresh','verify','reset'))
    );
    CREATE INDEX auth_throttle_lookup_idx ON auth_throttle_events(action, identifier_hash, occurred_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('auth_throttle_events');
  pgm.dropIndex('sessions', ['family_id', 'created_at'], { name: 'sessions_family_idx' });
  pgm.dropColumns('sessions', ['parent_session_id', 'replaced_by_session_id', 'last_used_at']);
};

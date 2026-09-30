CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- Every write to a synced row takes a new value from this sequence, so a
-- device can ask for "everything after seq N".
CREATE SEQUENCE sync_seq;

CREATE TABLE lists (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('audit', 'boq')),
  status      text NOT NULL CHECK (status IN ('draft', 'saved')),
  title       text NOT NULL DEFAULT '',
  address     text NOT NULL DEFAULT '',
  category    text NOT NULL DEFAULT '',
  site_date   text,
  notes       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL,
  deleted_at  timestamptz,
  seq         bigint NOT NULL DEFAULT nextval('sync_seq'),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX lists_seq_idx ON lists (user_id, seq);

CREATE TABLE items (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id            text NOT NULL,
  list_id       text NOT NULL,
  item_name     text NOT NULL DEFAULT '',
  original_term text NOT NULL DEFAULT '',
  quantity      double precision NOT NULL DEFAULT 0,
  unit          text NOT NULL DEFAULT '',
  unit_price    double precision NOT NULL DEFAULT 0,
  total_amount  double precision NOT NULL DEFAULT 0,
  vendor        text NOT NULL DEFAULT '',
  date          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL,
  deleted_at    timestamptz,
  seq           bigint NOT NULL DEFAULT nextval('sync_seq'),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX items_seq_idx ON items (user_id, seq);

CREATE TABLE indexed_rates (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          text NOT NULL,
  item_name   text NOT NULL,
  unit        text NOT NULL,
  date        text NOT NULL,
  price       double precision NOT NULL,
  vendor      text NOT NULL DEFAULT '',
  indexed_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL,
  deleted_at  timestamptz,
  seq         bigint NOT NULL DEFAULT nextval('sync_seq'),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX indexed_rates_seq_idx ON indexed_rates (user_id, seq);

CREATE TABLE learned_terms (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          text NOT NULL,
  item_name   text NOT NULL,
  unit        text NOT NULL,
  updated_at  timestamptz NOT NULL,
  deleted_at  timestamptz,
  seq         bigint NOT NULL DEFAULT nextval('sync_seq'),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX learned_terms_seq_idx ON learned_terms (user_id, seq);

CREATE TABLE categories (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          text NOT NULL,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL,
  deleted_at  timestamptz,
  seq         bigint NOT NULL DEFAULT nextval('sync_seq'),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX categories_seq_idx ON categories (user_id, seq);

CREATE TABLE extraction_jobs (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          uuid NOT NULL,
  status      text NOT NULL CHECK (status IN ('done', 'failed')),
  result      jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

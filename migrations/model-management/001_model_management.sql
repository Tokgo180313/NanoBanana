CREATE TABLE IF NOT EXISTS providers (
  id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  api_url VARCHAR(2048) NOT NULL,
  protocol VARCHAR(64) NOT NULL,
  api_key_ciphertext BLOB NOT NULL,
  api_key_nonce BINARY(12) NOT NULL,
  api_key_tag BINARY(16) NOT NULL,
  api_key_version VARCHAR(64) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS models (
  id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  provider_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  upstream_model_id VARCHAR(255) NOT NULL,
  name VARCHAR(150) NOT NULL,
  kind ENUM('image', 'video') NOT NULL,
  capabilities JSON NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_provider_model (provider_id, upstream_model_id),
  UNIQUE KEY uq_model_kind (id, kind),
  KEY idx_model_catalog (kind, enabled, sort_order),
  CONSTRAINT fk_model_provider FOREIGN KEY (provider_id) REFERENCES providers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS model_defaults (
  kind ENUM('image', 'video') PRIMARY KEY,
  model_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT fk_default_model_kind FOREIGN KEY (model_id, kind) REFERENCES models (id, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS model_config_changes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity_type ENUM('provider', 'model', 'default') NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  action VARCHAR(64) NOT NULL,
  details JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_model_config_entity (entity_type, entity_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

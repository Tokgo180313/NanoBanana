CREATE TABLE IF NOT EXISTS provider_connection_versions (
  provider_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version INT UNSIGNED NOT NULL,
  api_url VARCHAR(2048) NOT NULL,
  protocol VARCHAR(64) NOT NULL,
  api_key_ciphertext BLOB NOT NULL,
  api_key_nonce BINARY(12) NOT NULL,
  api_key_tag BINARY(16) NOT NULL,
  api_key_version VARCHAR(64) NOT NULL,
  PRIMARY KEY (provider_id, version),
  FOREIGN KEY (provider_id) REFERENCES providers (id)
);

CREATE TABLE IF NOT EXISTS generation_model_aliases (
  protocol VARCHAR(64) NOT NULL,
  legacy_model VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  model_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (protocol, legacy_model),
  FOREIGN KEY (model_id) REFERENCES models (id)
) DEFAULT CHARSET=utf8mb4;

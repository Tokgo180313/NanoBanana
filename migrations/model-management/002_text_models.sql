ALTER TABLE model_defaults DROP FOREIGN KEY fk_default_model_kind;

ALTER TABLE models MODIFY COLUMN kind ENUM('image', 'video', 'text') NOT NULL;

ALTER TABLE model_defaults
  MODIFY COLUMN kind ENUM('image', 'video', 'text') NOT NULL,
  ADD CONSTRAINT fk_default_model_kind FOREIGN KEY (model_id, kind) REFERENCES models (id, kind);

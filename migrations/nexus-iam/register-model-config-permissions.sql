-- Run against the Nexus_IAM schema, separately from migrate:mysql.
INSERT INTO iam_permission (app_id, code)
SELECT app.id, requested.code
FROM iam_application app
CROSS JOIN (
  SELECT 'model:config:read' AS code
  UNION ALL SELECT 'model:config:write'
) requested
WHERE app.app_code = 'image-workbench'
  AND NOT EXISTS (SELECT 1 FROM iam_permission p WHERE p.code = requested.code);

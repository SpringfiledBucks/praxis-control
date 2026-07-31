# Runtime secrets

This directory must contain four single-line secret files before deployment:

- `database-admin-password.txt`
- `database-app-password.txt`
- `access-password.txt` (at least 16 characters)
- `session-secret.txt` (at least 32 characters)

Only this README is versioned. Keep the actual files mode `0600` and out of Git,
container images, logs, and command-line arguments.

# OCI image publication

The authoritative Gitea `quality` workflow publishes an application image only after all main-branch quality jobs pass. Pull-request workflows never receive the package credential and never run the host-level publishing job.

## Required runner state

- a trusted Linux host runner labelled `linux`;
- Docker Engine and Docker Buildx;
- `jq`;
- the exact `node:24-bookworm-slim` image recorded in `base-images.lock`;
- a repository Actions secret named `OCI_REGISTRY_TOKEN`, limited to `write:package`.

The publish script refuses a different local base-image ID. This protects a temporarily offline runner from silently resolving a mutable tag to different bytes. Update the source platform digest and local image ID together after separately verifying a planned base-image upgrade.

## Authentication boundary

`publish.sh` accepts registry credentials over HTTPS. Plain HTTP is accepted only through an explicit loopback URL so the package token is not sent across the network unencrypted. The token is passed to `docker login` through standard input, is never added to image metadata, and is logged out in the exit trap.

## Published identity

Each successful main-branch build receives exactly one immutable tag:

```text
sha-<full-commit-sha>
```

Buildx records the resulting `sha256` manifest digest. The workflow summary and the ignored `artifacts/oci/image-lock.json` record the commit, tag, digest, platform, and locked base-image digest without embedding a private registry address. Deployments must use the manifest digest rather than the tag.

The current runner uses Buildx's Docker driver, which cannot emit attestations. The pipeline disables automatic provenance explicitly instead of pretending an attestation exists; adding signed provenance remains a separate upgrade that requires a supported builder and verification policy.

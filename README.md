# Happier assets

This repository publishes downloadable **voice model packs** used by Happier native apps.

## Model packs

Packs are published as:
- a `manifest.json` per pack (consumed by the app)
- a set of files referenced by that manifest (downloaded + sha256 verified on-device)

In the app, configure:
- `EXPO_PUBLIC_HAPPIER_MODEL_PACK_MANIFESTS` as a JSON map `{ [packId]: manifestUrl }`

## Build packs locally

```bash
npm run build:model-packs -- --repo happier/happier-assets --tag model-packs-dev
```

Artifacts are written to:
- `dist/packs/<packId>/...` (human-inspectable pack tree)
- `dist/release/<asset files>` (release-ready asset names)

## Publishing

Use the GitHub Actions workflow `Release model packs` (manual dispatch) or push a tag matching `model-packs-*`.


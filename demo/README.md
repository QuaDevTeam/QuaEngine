# 断链纪元

QuaEngine visual novel demo about a future human resistance confronting a city-scale AI.

## Copyright

The demo game, including its story, characters, artwork, generated assets, and presentation content, is proprietary and fully copyrighted. It is not distributed under the repository's MIT license unless a separate written license says otherwise.

## Local commands

```bash
pnpm install
pnpm --filter demo assets:generate
pnpm --filter demo assets:regenerate-characters
pnpm --filter demo assets:build
pnpm --filter demo dev
```

`assets:generate` only fills missing images. Use `assets:regenerate-characters` when replacing old character standees with refreshed non-chibi, adult-proportioned VN sprites. Character regeneration defaults to an anime-oriented Replicate model with a flat solid background, background removal, cleanup, and sprite-size normalization.

Both asset commands use the local Replicate CLI profile `quaengine-demo`. Do not commit API keys or raw generation logs.

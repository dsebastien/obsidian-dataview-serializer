# How to contribute

## Creating an Issue

Before you create a new Issue:

1. Please make sure there is no open issue about the topic yet
2. If it is a bug report, include the steps to reproduce the issue
3. If it is a feature request, please share the motivation for the new feature and how you would implement it

## Tests

If you want to submit a bug fix or new feature, make sure that all tests are passing.

```bash
$ bun test
```

## Submitting a Pull Request

- Check out the open issues first. Create new ones or discuss if needed
- Fork the project
- Push changes to a dedicated branch of your fork
- Submit a pull request
- Be sure to tag any issues your pull request is taking care of or is contributing to.

## Development environment

In addition to the classic (bun installation, etc), make sure to define the `OBSIDIAN_VAULT_LOCATION` environment variable. It should point to the root folder of an existing Obsidian vault. When building the DEV version (`bun run dev`), the plugin will be copied to that vault's `.obsidian/plugins` folder. This makes it easy to build and automatically have the up to date plugin for testing in Obsidian. It also avoids having to store the codebase within the Obsidian vault...

## Git hooks (Git 2.54+)

This repo uses [Git's built-in config-based hooks](https://github.blog/open-source/git/highlights-from-git-2-54/) (introduced in **Git 2.54**) instead of Husky + `lint-staged`. The hook definitions live in a tracked `.gitconfig` file at the repo root and are committed to source control.

### Enable the hooks once per clone

After the first `bun install`, run:

```bash
bun run setup
```

That script runs `git config --local --replace-all include.path ../.gitconfig` — the path is relative to `.git/`, so `../.gitconfig` resolves to the repo root. Git then reads the tracked `.gitconfig`, picking up:

- **`pre-commit` → `scripts/git-hooks/format-staged.sh`** — runs Prettier over the staged files and re-stages them.
- **`commit-msg` → `bunx commitlint --edit`** — validates the commit message against `commitlint.config.ts`.

Confirm the hooks are wired up:

```bash
git hook list pre-commit
git hook list commit-msg
```

### Requirements

- Git **≥ 2.54** is required for config-based hooks. Older Git versions silently ignore them, so the hooks won't run (but nothing will break).

### Why not Husky?

Husky + `lint-staged` together pull in ~80 transitive deps and require a `prepare` post-install script to inject shims into `.git/hooks/`. Git 2.54 provides the same functionality natively, the hook config is plain text in version control, and there's no install-time magic.

## Releasing a new version

- Commit all changes
- Update the `minAppVersion` manually in `manifest.json` if needed (if the plugin requires a newer version of Obsidian)
- Run `bun run release:update-version <version>` to update package.json
- Run `bun run release:version-bump` to update manifest.json and versions.json
- Run `bun run release:changelog` to generate the changelog
- Commit the version changes and push
- Create a git tag and push it: `git tag vX.Y.Z && git push --tags`
- The GitHub workflow will create the GitHub release and will add the necessary files as binary attachments

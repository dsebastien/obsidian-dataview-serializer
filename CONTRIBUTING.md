# How to contribute

## Creating an Issue

Before you create a new Issue:

1. Please make sure there is no open issue about the topic yet
2. If it is a bug report, include the steps to reproduce the issue
3. If it is a feature request, please share the motivation for the new feature and how you would implement it

## Tests

If you want to submit a bug fix or new feature, make sure that all tests are passing.

```bash
$ npm test
```

## Submitting a Pull Request

- Check out the open issues first. Create new ones or discuss if needed
- Fork the project
- Push changes to a dedicated branch of your fork
- Submit a pull request
- Be sure to tag any issues your pull request is taking care of or is contributing to.

## Development environment

In addition to the classic (npm/node, installation, etc), make sure to define the `OBSIDIAN_VAULT_LOCATION` environment variable. It should point to the root folder of an existing Obsidian vault. When building the DEV version (`npm run build:dev` or `npm run watch`), the plugin will be copied to that vault's `.obsidian/plugins` folder. This makes it easy to build and automatically have the up to date plugin for testing in Obsidian. It also avoids having to store the codebase within the Obsidian vault...

## Releasing a new version

- Commit all changes
- Update the `minAppVersion` manually in `manifest.json` if needed (if the plugin requires a newer version of Obsidian)
- Run `npm version patch`, `npm version minor` or `npm version major` to update the `manifest.json` and `package.json` files and create the tag
- Push the changes and the tag: `git push && git push --tags`
- The GitHub workflow will create the GitHub release and will add the necessary files as binary attachments

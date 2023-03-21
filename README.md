# setup-eli

[![Basic validation](https://github.com/alis-is/setup-eli/actions/workflows/basic-validation.yml/badge.svg)](https://github.com/alis-is/setup-eli/actions/workflows/basic-validation.yml)
[![Validate 'setup-eli'](https://github.com/alis-is/setup-eli/actions/workflows/versions.yml/badge.svg)](https://github.com/alis-is/setup-eli/actions/workflows/versions.yml)

This action sets up a eli environment for use in actions by:

- Optionally downloading and caching a version of eli by version and adding to `PATH`.

# Usage

```yaml
steps:
  - uses: actions/checkout@v3
  - uses: actions/setup-eli@v0
    with:
      eli-version: '0.29.1' # The eli version to download (if necessary) and use.
  - run: eli -v
```
# Contributing to Nonla Desk

Thank you for your interest in contributing to Nonla Desk! This guide will help you get started.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Convention](#commit-convention)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/nonla-desk.git
   cd nonla-desk
   ```
3. **Install dependencies**:
   ```bash
   bun install
   ```
4. **Set up environment**:
   ```bash
   cp .env.example .env
   # Add your API keys to .env
   ```
5. **Create a branch** for your work:
   ```bash
   git checkout -b feat/my-feature
   ```

## Development Workflow

```bash
# Start development mode
bun dev

# Run linter
bun run lint

# Format code
bun run format

# Lint + format with auto-fix
bun run check
```

### Project Architecture

- **`src/main/`** — Electron main process (Node.js runtime)
- **`src/preload/`** — Preload scripts for secure IPC bridge
- **`src/renderer/`** — React frontend (browser runtime)

## Pull Request Process

1. Ensure your code passes all lint checks: `bun run check`
2. Update documentation if your change affects public APIs or user-facing behavior
3. Write a clear PR title following the [commit convention](#commit-convention)
4. Fill out the PR template with a description of your changes
5. Request review from at least one maintainer

### PR Checklist

- [ ] Code compiles without errors (`bun run build`)
- [ ] Linter passes (`bun run check`)
- [ ] Changes are documented (if applicable)
- [ ] Commit messages follow the convention

## Coding Standards

This project uses [Biome](https://biomejs.dev/) for linting and formatting. Configuration is in [`biome.json`](biome.json).

### Key Rules

- **Indent**: 2 spaces
- **Quotes**: Single quotes
- **Semicolons**: Only when required (ASI-safe)
- **Line width**: 100 characters max
- **Imports**: Auto-organized by Biome

### TypeScript

- Use strict TypeScript — avoid `any` when possible
- Prefer `interface` over `type` for object shapes
- Use explicit return types for exported functions

## Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                                |
|------------|--------------------------------------------|
| `feat`     | A new feature                              |
| `fix`      | A bug fix                                  |
| `docs`     | Documentation only changes                 |
| `style`    | Code style changes (formatting, etc.)      |
| `refactor` | Code change that neither fixes nor adds    |
| `perf`     | Performance improvement                    |
| `test`     | Adding or updating tests                   |
| `build`    | Build system or external dependency changes|
| `ci`       | CI configuration changes                   |
| `chore`    | Other changes that don't modify src/test   |

### Examples

```
feat(renderer): add voice input toggle button
fix(main): handle database migration on first launch
docs: update README with build instructions
```

## Reporting Bugs

Use [GitHub Issues](https://github.com/devnonla/nonla-desk/issues/new?template=bug_report.md) with the bug report template. Include:

- macOS version
- App version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or screenshots

## Suggesting Features

Use [GitHub Issues](https://github.com/devnonla/nonla-desk/issues/new?template=feature_request.md) with the feature request template. Include:

- Problem you're trying to solve
- Proposed solution
- Alternatives you've considered

---

Thank you for contributing! 🎉

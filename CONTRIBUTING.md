# Contributing to Rustyleaf

We welcome contributions! 🚀 Whether you're fixing a bug, implementing a feature, or improving documentation, we appreciate your help.

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)

## 🚀 Getting Started

1. **Fork the repository**
2. **Clone your fork**:
   ```bash
   git clone https://github.com/your-username/rustyleaf.git
   cd rustyleaf
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/mehdilhy/rustyleaf.git
   ```

## 🛠️ Development Setup

### Prerequisites
- **Rust**: Latest stable version
- **wasm-pack**: For WebAssembly compilation
- **Node.js**: Version 18 or higher
- **npm/yarn/pnpm**: Package manager

### Installation
```bash
# Install Rust target for WebAssembly
rustup target add wasm32-unknown-unknown

# Install wasm-pack
cargo install wasm-pack

# Install Node.js dependencies
npm install
```

### Building and Testing
```bash
# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Format code
npm run format

# Lint code
npm run lint

# Type checking
npm run typecheck
```

### Running Examples
```bash
# Build the project first
npm run build

# Open examples in your browser
# macOS:
open examples/basic/index.html
# Linux:
xdg-open examples/basic/index.html
# Windows:
start examples\basic\index.html
```

## 🎨 Code Style

### Rust Code
- Use `cargo fmt` for formatting
- Use `cargo clippy` for linting
- Follow Rust API Guidelines (RFC)
- Write comprehensive documentation

### JavaScript/TypeScript Code
- Use ESLint for linting
- Use Prettier for formatting
- Follow TypeScript best practices
- Include JSDoc comments for public APIs

### General Guidelines
- Write clear, descriptive commit messages
- Keep functions small and focused
- Add tests for new functionality
- Update documentation for API changes

## 📤 Submitting Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Follow the code style guidelines
   - Add tests for new functionality
   - Update documentation if needed

3. **Test your changes**:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**:
   - Use the PR template
   - Link to relevant issues
   - Describe your changes clearly

## 🐛 Reporting Issues

When reporting bugs, please:
1. Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml)
2. Provide minimal reproduction steps
3. Include your environment information
4. Add screenshots or error messages if applicable

## 📝 PR Checklist

- [ ] I have read the [Contributing Guidelines](CONTRIBUTING.md)
- [ ] My code follows the project's code style
- [ ] I have run tests locally and they pass
- [ ] I have added necessary tests (if applicable)
- [ ] I have updated documentation (if applicable)
- [ ] My changes don't break existing functionality
- [ ] I have formatted my code with the project's linter

## 🤝 Getting Help

If you need help with your contribution:
- Check existing issues and discussions
- Ask questions in your PR
- Join our community discussions

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

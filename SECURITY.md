# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | ❌ No support      |
| 0.1.x   | ✅ Security fixes  |
| 0.2.x   | ✅ Security fixes  |

> **Note**: This project is currently in pre-alpha development. No versions are currently supported for production use.

## Reporting a Vulnerability

**IMPORTANT**: This project is experimental and not intended for production use. However, if you discover a potential security issue, please report it responsibly.

### How to Report

1. **Do not** create a public GitHub issue
2. **Do not** discuss the vulnerability in public channels
3. **Do** send a detailed report to: mehdilhy@gmail.com
4. **Do** include reproduction steps and affected versions

### What to Include

- A clear description of the vulnerability
- Steps to reproduce the issue
- Affected versions
- Potential impact
- Any proposed mitigations

### Response Timeline

- **Initial acknowledgment**: Within 48 hours
- **Assessment and fix**: Depends on complexity
- **Public disclosure**: After fix is available

## Security Considerations

This project currently has:
- Minimal input validation
- No sanitization of external data
- Experimental WebGL/WASM implementation
- Memory management issues (being addressed)

**Do not use in production environments.**

## Dependencies

Security vulnerabilities in dependencies should be reported through the appropriate channels:
- Rust crates: Report via [RustSec](https://github.com/rustsec/advisory-db)
- npm packages: Report via [npm advisory](https://www.npmjs.com/advisories)

## License

Security fixes are provided under the same MIT license as the main project.

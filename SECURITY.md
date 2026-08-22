# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | ✅ Security fixes (latest pre-alpha) |

> **Note**: This project is pre-alpha. Only the latest published version
> receives fixes — there is no long-term support branch yet. Not intended
> for production use.

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
- No WebGL1/Canvas2D fallback — WebGL2 is required

**Do not use in production environments.**

## Dependencies

Security vulnerabilities in dependencies should be reported through the appropriate channels:
- Rust crates: Report via [RustSec](https://github.com/rustsec/advisory-db)
- npm packages: Report via [npm advisory](https://www.npmjs.com/advisories)

## License

Security fixes are provided under the same MIT license as the main project.

# Contributing to @quajs/quack

Thank you for your interest in contributing to Quack! This guide will help you get started with contributing to the asset bundler for QuaEngine.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Contributing Guidelines](#contributing-guidelines)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## Code of Conduct

This project follows the [QuaEngine Code of Conduct](../../CODE_OF_CONDUCT.md). Please read and follow it in all your interactions with the project.

## Development Setup

### Prerequisites

- Node.js 20 or higher
- pnpm (recommended) or npm
- Git

### Setup Steps

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/QuaEngine.git
   cd QuaEngine/packages/quack
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Build the Package**
   ```bash
   pnpm run build
   ```

4. **Run Tests**
   ```bash
   pnpm test
   ```

5. **Start Development**
   ```bash
   pnpm run dev  # Watch mode for development
   ```

## Project Structure

```
packages/quack/
├── src/
│   ├── core/           # Core bundler logic and types
│   │   ├── bundler.ts  # Main QuackBundler class
│   │   └── types.ts    # TypeScript type definitions
│   ├── assets/         # Asset detection and metadata
│   │   ├── asset-detector.ts     # Asset discovery
│   │   ├── media-extractor.ts   # Media metadata extraction
│   │   └── metadata.ts          # Bundle metadata generation
│   ├── bundlers/       # Format-specific bundlers
│   │   ├── zip-bundler.ts  # ZIP format support
│   │   └── qpk-bundler.ts  # QPK format support
│   ├── workspace/      # Multi-bundle workspace management
│   ├── crypto/         # Encryption utilities
│   ├── managers/       # Plugin and utility managers
│   └── cli/           # Command-line interface
├── test/              # Test files
├── docs/              # Documentation
├── README.md          # Package documentation
├── CHANGELOG.md       # Version history
└── package.json       # Package configuration
```

## Contributing Guidelines

### 🐛 Bug Reports

When filing a bug report, please include:

1. **Clear description** of the issue
2. **Steps to reproduce** the problem
3. **Expected vs actual behavior**
4. **Environment information** (Node.js version, OS, etc.)
5. **Sample code or assets** that demonstrate the issue
6. **Error messages or logs** if available

Use the bug report template:

```markdown
## Bug Description
Brief description of the bug

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What you expected to happen

## Actual Behavior
What actually happened

## Environment
- Node.js version: 
- OS: 
- Quack version: 

## Additional Context
Any other relevant information
```

### ✨ Feature Requests

For feature requests, please include:

1. **Use case** - Why is this feature needed?
2. **Proposed solution** - How should it work?
3. **Alternatives considered** - What other approaches did you consider?
4. **Breaking changes** - Would this break existing functionality?

### 🔧 Code Contributions

#### Areas for Contribution

1. **Media Format Support**
   - Additional image formats (TIFF, BMP, AVIF)
   - Enhanced video metadata extraction
   - Audio format improvements (FLAC, AAC, OGG)

2. **Performance Improvements**
   - Streaming parsers for large files
   - Memory optimization
   - Parallel processing

3. **Plugin System**
   - Image optimization plugins
   - Custom encryption plugins
   - Asset transformation plugins

4. **Documentation**
   - API documentation improvements
   - Usage examples
   - Tutorial content

#### Coding Standards

1. **TypeScript First**
   - Use TypeScript for all new code
   - Provide proper type definitions
   - Avoid `any` types when possible

2. **Code Style**
   - Use 2 spaces for indentation
   - Follow existing naming conventions
   - Use meaningful variable and function names
   - Add JSDoc comments for public APIs

3. **Error Handling**
   - Use proper error types
   - Provide meaningful error messages
   - Handle edge cases gracefully
   - Log warnings for non-fatal issues

4. **Performance**
   - Avoid blocking operations where possible
   - Use streaming for large files
   - Implement proper memory management
   - Consider backwards compatibility

#### Example Code Structure

```typescript
import { createLogger } from '@quajs/logger'
import type { MediaMetadata } from '../core/types'

const logger = createLogger('quack:new-feature')

/**
 * Description of what this class does
 */
export class NewFeature {
  private config: SomeConfig

  constructor(config: SomeConfig) {
    this.config = config
  }

  /**
   * Main method with clear documentation
   * @param input - Description of input parameter
   * @returns Promise resolving to the result
   */
  async processInput(input: string): Promise<MediaMetadata | null> {
    try {
      logger.debug(`Processing input: ${input}`)
      
      // Implementation here
      const result = await this.doProcessing(input)
      
      logger.info(`Successfully processed: ${input}`)
      return result
    } catch (error) {
      logger.error(`Failed to process ${input}:`, error)
      throw new Error(`Processing failed: ${error.message}`)
    }
  }

  private async doProcessing(input: string): Promise<MediaMetadata> {
    // Private method implementation
  }
}
```

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage

# Run specific test file
pnpm test media-extractor

# Run tests for specific pattern
pnpm test --grep "PNG metadata"
```

### Writing Tests

1. **Test Structure**
   - Use `describe` blocks to group related tests
   - Use descriptive test names
   - Follow the AAA pattern (Arrange, Act, Assert)

2. **Test Files**
   - Place test files in the `test/` directory
   - Name test files with `.test.ts` suffix
   - Mirror the source file structure

3. **Test Examples**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MediaMetadataExtractor } from '../src/assets/media-extractor'

describe('MediaMetadataExtractor', () => {
  let extractor: MediaMetadataExtractor

  beforeEach(() => {
    extractor = new MediaMetadataExtractor()
  })

  describe('PNG extraction', () => {
    it('should extract PNG dimensions correctly', async () => {
      // Arrange
      const testFile = './test-assets/test.png'
      
      // Act
      const metadata = await extractor.extractMetadata(testFile)
      
      // Assert
      expect(metadata).toBeDefined()
      expect(metadata.width).toBe(100)
      expect(metadata.height).toBe(50)
      expect(metadata.format).toBe('PNG')
    })

    it('should handle corrupted PNG files gracefully', async () => {
      const corruptedFile = './test-assets/corrupted.png'
      
      const metadata = await extractor.extractMetadata(corruptedFile)
      
      expect(metadata.width).toBe(0)
      expect(metadata.height).toBe(0)
    })
  })
})
```

### Test Asset Creation

For media format tests, create minimal valid files:

```typescript
// Create a minimal PNG for testing
const createTestPNG = (width: number, height: number): Buffer => {
  return Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
    0x49, 0x48, 0x44, 0x52, // IHDR
    (width >> 24) & 0xFF, (width >> 16) & 0xFF, 
    (width >> 8) & 0xFF, width & 0xFF,
    (height >> 24) & 0xFF, (height >> 16) & 0xFF,
    (height >> 8) & 0xFF, height & 0xFF,
    0x08, 0x02, 0x00, 0x00, 0x00, // 8-bit RGB
    0x00, 0x00, 0x00, 0x00, // CRC (simplified)
    // IEND chunk
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0x00, 0x00, 0x00, 0x00
  ])
}
```

## Documentation

### API Documentation

- Document all public APIs with JSDoc comments
- Include parameter types and return types
- Provide usage examples
- Document error conditions

### README Updates

When adding new features:
1. Update the features list
2. Add usage examples
3. Update the API reference
4. Add any new configuration options

### Changelog

All changes must be documented in `CHANGELOG.md`:

```markdown
### Added
- New feature description with details

### Changed
- Modified behavior explanation

### Fixed
- Bug fix description

### Deprecated
- Feature deprecation notice
```

## Pull Request Process

### Before Submitting

1. **Run Tests**
   ```bash
   pnpm test
   pnpm run lint
   pnpm run typecheck
   ```

2. **Update Documentation**
   - Update README if needed
   - Add/update JSDoc comments
   - Update CHANGELOG.md

3. **Test Your Changes**
   - Add tests for new functionality
   - Ensure existing tests pass
   - Test edge cases and error conditions

### PR Guidelines

1. **Title Format**
   - Use conventional commit format: `feat:`, `fix:`, `docs:`, etc.
   - Be descriptive: `feat: add WebP animation detection`

2. **Description Template**
   ```markdown
   ## Changes
   Brief description of what changed
   
   ## Testing
   How the changes were tested
   
   ## Breaking Changes
   Any breaking changes (if applicable)
   
   ## Checklist
   - [ ] Tests added/updated
   - [ ] Documentation updated
   - [ ] Changelog updated
   - [ ] Types are correct
   ```

3. **Code Review**
   - Address all reviewer feedback
   - Keep discussions constructive
   - Explain complex changes clearly

### Review Process

1. **Automated Checks**
   - All tests must pass
   - Linting must pass
   - Type checking must pass
   - Build must succeed

2. **Code Review**
   - At least one maintainer approval required
   - Focus on code quality, performance, and maintainability
   - Check for proper error handling and edge cases

3. **Merge**
   - Squash and merge for feature branches
   - Maintain clean commit history
   - Delete feature branch after merge

## Release Process

Releases are handled by maintainers:

1. **Version Bump**
   - Update package.json version
   - Update CHANGELOG.md
   - Create git tag

2. **Build and Publish**
   - Run full test suite
   - Build distribution files
   - Publish to npm

3. **GitHub Release**
   - Create GitHub release
   - Include changelog notes
   - Attach build artifacts if needed

## Getting Help

- **Discord**: Join our [Discord server](https://discord.gg/quaengine) for real-time help
- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For general questions and community discussion
- **Documentation**: Check the [main docs](../../docs) for comprehensive guides

## Recognition

Contributors will be:
- Added to the contributors list in README
- Mentioned in release notes for significant contributions
- Invited to join the maintainer team for consistent, high-quality contributions

Thank you for contributing to Quack! 🚀
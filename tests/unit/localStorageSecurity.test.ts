import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalStorageProvider } from '@/infrastructure/storage/localStorage';
import { normaliseStorageKey } from '@/domain/storageKey';
import { DomainError } from '@/domain/errors';
import os from 'node:os';

describe('LocalStorageProvider Security (Phase 2)', () => {
  let rootPath: string;
  let provider: LocalStorageProvider;
  
  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-storage-test-'));
    provider = new LocalStorageProvider(rootPath, 'http://localhost:3000');
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  describe('normaliseStorageKey', () => {
    it('refuses a storage key containing a null byte', () => {
      expect(() => normaliseStorageKey('valid/path\0/file.png')).toThrow(DomainError);
    });

    it('refuses a storage key containing a directory traversal', () => {
      expect(() => normaliseStorageKey('../escaped.png')).toThrow(DomainError);
      expect(() => normaliseStorageKey('valid/../../escaped.png')).toThrow(DomainError);
      expect(() => normaliseStorageKey('/../escaped.png')).toThrow(DomainError);
    });

    it('refuses a storage key containing a drive letter', () => {
      expect(() => normaliseStorageKey('C:/Windows/System32/cmd.exe')).toThrow(DomainError);
      expect(() => normaliseStorageKey('d:\\secret.txt')).toThrow(DomainError);
    });

    it('allows valid relative keys and normalises separators', () => {
      expect(normaliseStorageKey('projects/foo/image.png')).toBe('projects/foo/image.png');
      expect(normaliseStorageKey('projects\\foo\\image.png')).toBe('projects/foo/image.png');
    });

    it('refuses absolute POSIX and UNC storage keys instead of sanitising them', () => {
      expect(() => normaliseStorageKey('/projects/foo/image.png')).toThrow(DomainError);
      expect(() => normaliseStorageKey('\\\\server\\share\\image.png')).toThrow(DomainError);
    });
  });

  describe('Symlink and Root Confinement', () => {
    it('resolves symlinks in the target path and ensures they do not escape the storage root', async () => {
      // Create a directory OUTSIDE the storage root
      const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-external-'));
      
      // Create a symlink INSIDE the storage root pointing to the external dir
      const symlinkPath = path.join(rootPath, 'trap');
      // Use junction or dir on windows to not require admin rights, node:fs uses dir for junction fallback usually, but let's just create a junction.
      await fs.symlink(externalDir, symlinkPath, 'junction');

      // Attempt to write a file through the symlink
      await expect(provider.put('trap/escaped.png', 'malicious payload', 'image/png'))
        .rejects
        .toThrow(/escapes storage root via symlink/);
        
      await fs.rm(externalDir, { recursive: true, force: true });
    });

    it('allows writes to valid directories within the root', async () => {
      const stored = await provider.put('projects/test/valid.png', 'good payload', 'image/png');
      expect(stored.key).toBe('projects/test/valid.png');
      
      const exists = await provider.exists('projects/test/valid.png');
      expect(exists).toBe(true);
    });

    it('returns a client-safe storage error without exposing the absolute root path', async () => {
      try {
        await provider.get('projects/test/does_not_exist.png');
        throw new Error('Expected provider.get() to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        const envelope = JSON.stringify((error as DomainError).toJSON());
        expect(envelope).not.toContain(rootPath);
      }
    });
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkVaultConfig } from '../src/index';

test('checkVaultConfig: warns when LOCAL_DEV_MASTER_KEY is missing', () => {
  const loggedWarnings: string[] = [];
  const mockLogger = {
    warn: (msg: string) => { loggedWarnings.push(msg); },
  };

  const warnings = checkVaultConfig(
    { NODE_ENV: 'development' },
    mockLogger,
  );

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /LOCAL_DEV_MASTER_KEY/);
  assert.match(warnings[0], /\[vault\]/);
  assert.deepEqual(loggedWarnings, warnings);
});

test('checkVaultConfig: warns when LOCAL_DEV_MASTER_KEY is empty or whitespace', () => {
  const loggedWarnings: string[] = [];
  const mockLogger = {
    warn: (msg: string) => { loggedWarnings.push(msg); },
  };

  const warnings = checkVaultConfig(
    { NODE_ENV: 'development', LOCAL_DEV_MASTER_KEY: '   ' },
    mockLogger,
  );

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /LOCAL_DEV_MASTER_KEY/);
});

test('checkVaultConfig: does not warn about LOCAL_DEV_MASTER_KEY when present', () => {
  const loggedWarnings: string[] = [];
  const mockLogger = {
    warn: (msg: string) => { loggedWarnings.push(msg); },
  };

  const warnings = checkVaultConfig(
    {
      NODE_ENV: 'development',
      LOCAL_DEV_MASTER_KEY: 'c29tZS1zZWNyZXQta2V5LWZvci10ZXN0aW5nLTEyMzQ1Njc4OTA=',
    },
    mockLogger,
  );

  assert.equal(warnings.length, 0);
  assert.equal(loggedWarnings.length, 0);
});

test('checkVaultConfig: production mode without VAULT_ALLOW_UNSAFE_KEY_PROVIDER=true produces warning', () => {
  const loggedWarnings: string[] = [];
  const mockLogger = {
    warn: (msg: string) => { loggedWarnings.push(msg); },
  };

  const warnings = checkVaultConfig(
    {
      NODE_ENV: 'production',
      LOCAL_DEV_MASTER_KEY: 'c29tZS1zZWNyZXQta2V5LWZvci10ZXN0aW5nLTEyMzQ1Njc4OTA=',
    },
    mockLogger,
  );

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /VAULT_ALLOW_UNSAFE_KEY_PROVIDER/);
  assert.match(warnings[0], /production/i);
  assert.deepEqual(loggedWarnings, warnings);
});

test('checkVaultConfig: production mode with VAULT_ALLOW_UNSAFE_KEY_PROVIDER=true produces no warning for that setting', () => {
  const loggedWarnings: string[] = [];
  const mockLogger = {
    warn: (msg: string) => { loggedWarnings.push(msg); },
  };

  const warnings = checkVaultConfig(
    {
      NODE_ENV: 'production',
      LOCAL_DEV_MASTER_KEY: 'c29tZS1zZWNyZXQta2V5LWZvci10ZXN0aW5nLTEyMzQ1Njc4OTA=',
      VAULT_ALLOW_UNSAFE_KEY_PROVIDER: 'true',
    },
    mockLogger,
  );

  assert.equal(warnings.length, 0);
  assert.equal(loggedWarnings.length, 0);
});

test('checkVaultConfig: development mode does not produce production-only warning', () => {
  const loggedWarnings: string[] = [];
  const mockLogger = {
    warn: (msg: string) => { loggedWarnings.push(msg); },
  };

  const warnings = checkVaultConfig(
    {
      NODE_ENV: 'development',
      LOCAL_DEV_MASTER_KEY: 'c29tZS1zZWNyZXQta2V5LWZvci10ZXN0aW5nLTEyMzQ1Njc4OTA=',
      VAULT_ALLOW_UNSAFE_KEY_PROVIDER: 'false',
    },
    mockLogger,
  );

  assert.equal(warnings.length, 0);
  assert.equal(loggedWarnings.length, 0);
});

test('checkVaultConfig: missing both settings in production identifies both without crashing', () => {
  const loggedWarnings: string[] = [];
  const mockLogger = {
    warn: (msg: string) => { loggedWarnings.push(msg); },
  };

  const warnings = checkVaultConfig(
    { NODE_ENV: 'production' },
    mockLogger,
  );

  assert.equal(warnings.length, 2);
  assert.ok(warnings.some(w => w.includes('LOCAL_DEV_MASTER_KEY')));
  assert.ok(warnings.some(w => w.includes('VAULT_ALLOW_UNSAFE_KEY_PROVIDER')));
  assert.equal(loggedWarnings.length, 2);
});

test('checkVaultConfig: warning messages never expose secret values or key contents', () => {
  const secretKey = 'super-secret-key-that-must-never-be-logged';
  const loggedWarnings: string[] = [];
  const mockLogger = {
    warn: (msg: string) => { loggedWarnings.push(msg); },
  };

  const warnings = checkVaultConfig(
    {
      NODE_ENV: 'production',
      LOCAL_DEV_MASTER_KEY: secretKey,
      VAULT_ALLOW_UNSAFE_KEY_PROVIDER: 'false',
    },
    mockLogger,
  );

  for (const warning of warnings) {
    assert.ok(!warning.includes(secretKey), `Warning exposed secret value: ${warning}`);
  }
});

test('checkVaultConfig: uses process.env and console by default without throwing', () => {
  const origKey = process.env.LOCAL_DEV_MASTER_KEY;
  const origNodeEnv = process.env.NODE_ENV;
  const origUnsafe = process.env.VAULT_ALLOW_UNSAFE_KEY_PROVIDER;

  try {
    delete process.env.LOCAL_DEV_MASTER_KEY;
    process.env.NODE_ENV = 'development';

    const warnings = checkVaultConfig();
    assert.ok(warnings.length >= 1);
    assert.match(warnings[0], /LOCAL_DEV_MASTER_KEY/);
  } finally {
    if (origKey !== undefined) process.env.LOCAL_DEV_MASTER_KEY = origKey;
    else delete process.env.LOCAL_DEV_MASTER_KEY;
    if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
    else delete process.env.NODE_ENV;
    if (origUnsafe !== undefined) process.env.VAULT_ALLOW_UNSAFE_KEY_PROVIDER = origUnsafe;
    else delete process.env.VAULT_ALLOW_UNSAFE_KEY_PROVIDER;
  }
});

test('index module: exports checkVaultConfig and startServer without starting listeners on import', async () => {
  const indexModule = await import('../src/index');
  assert.equal(typeof indexModule.checkVaultConfig, 'function');
  assert.equal(typeof indexModule.startServer, 'function');
});

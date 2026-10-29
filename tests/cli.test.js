// tests/cli.test.js - Command-line argument parsing and help tests.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, printHelp, HELP_TEXT } = require('../src/cli');

describe('cli', () => {
  test('HELP_TEXT documents usage and flags', () => {
    assert.ok(HELP_TEXT.includes('Usage:'));
    assert.ok(HELP_TEXT.includes('--debug'));
    assert.ok(HELP_TEXT.includes('--help'));
    assert.ok(HELP_TEXT.includes('npm run debug'));
    assert.ok(HELP_TEXT.includes('node index.js [--debug]'));
    assert.ok(HELP_TEXT.includes('npm start -- [--debug]'));
  });

  test('parseArgs defaults to no flags', () => {
    const args = parseArgs([]);
    assert.equal(args.help, false);
    assert.equal(args.debug, false);
    assert.deepEqual(args._, []);
    assert.deepEqual(args, { help: false, debug: false, _: [] });
  });

  test('parseArgs with default args returns debug false', () => {
    const args = parseArgs([]);
    assert.equal(args.debug, false);
    assert.deepEqual(args, { debug: false, help: false, _: [] });
  });

  test('parseArgs --debug enables debug', () => {
    const args = parseArgs(['--debug']);
    assert.equal(args.debug, true);
    assert.equal(args.help, false);
  });

  test('parseArgs --help enables help', () => {
    const args = parseArgs(['--help']);
    assert.equal(args.help, true);
  });

  test('parseArgs mixes flags and positionals', () => {
    const args = parseArgs(['--debug', 'serve']);
    assert.equal(args.debug, true);
    assert.deepEqual(args._, ['serve']);
  });

  test('parseArgs rejects unknown flags with a CLI error', () => {
    assert.throws(() => parseArgs(['--deubg']), (err) => err.isCliError === true);
  });

  test('parseArgs accepts positionals without throwing', () => {
    const args = parseArgs(['serve']);
    assert.deepEqual(args._, ['serve']);
  });

  test('printHelp outputs usage text', () => {
    const lines = [];
    const origLog = console.log;
    console.log = (line) => lines.push(line);
    try {
      printHelp();
    } finally {
      console.log = origLog;
    }
    const output = lines.join('\n');
    assert.ok(output.includes('OllaSieve'));
    assert.ok(output.includes('--debug'));
    assert.ok(output.includes('--help'));
  });
});

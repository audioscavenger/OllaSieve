// src/cli.js - Command-line argument parsing and help text for OllaSieve.

const HELP_TEXT = `OllaSieve - agent proxy between OpenChamber and OpenCode

Usage:
  node index.js [--debug]
  npm start -- [--debug]
  npm run debug

Options:
  --debug, -d    Enable deep debug logging. Traces requests received by the
                 plugins (the prompt) and the replies (wrapped OllaClass
                 responses, tev1 payloads and replies).
  --help, -h     Show this help and exit.

Notes:
  When invoked via npm start, npm will strip unknown flags (such as --help and --debug)
  unless prefixed with a "--". Use "npm start -- --debug" to enable debug tracing.
  npm run debug is provided to make debug tracing unconditional.

Environment:
  OLLASIEVE_CONFIG    Path to ollasieve.config.json (overrides ./ollasieve.config.json).
`;

/**
 * Parses command-line arguments into flags.
 *
 * @param {string[]} [argv] - Argument list to parse (defaults to process.argv.slice(2)).
 * @returns {{help: boolean, debug: boolean, _: string[]}} Parsed flags and positionals.
 */
function parseArgs(argv = []) {
  const parsed = { help: false, debug: false, _: [] };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--debug' || arg === '-d') {
      parsed.debug = true;
    } else if (arg.startsWith('-')) {
      // Unknown flag: emit to stderr, print help.
      // The caller (main) exits after catching.
      const err = new Error(`Unknown CLI flag: ${arg}`);
      err.isCliError = true;
      throw err;
    } else {
      // Positional argument (does not start with -)
      parsed._.push(arg);
    }
  }
  return parsed;
}

/**
 * Prints the command-line help text to stdout.
 * @returns {void}
 */
function printHelp() {
  console.log(HELP_TEXT);
}

module.exports = { parseArgs, printHelp, HELP_TEXT };

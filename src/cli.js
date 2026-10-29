// src/cli.js - Command-line argument parsing and help text for OllaSieve.

const HELP_TEXT = `OllaSieve - agent proxy between OpenChamber and OpenCode

Usage:
  npm start -- [--debug]

Options:
  --debug, -d    Enable deep debug logging. Traces requests received by the
                 plugins (the prompt) and the replies (wrapped OllaClass
                 responses, tev1 payloads and replies).
  --help, -h     Show this help and exit.

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
    } else {
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

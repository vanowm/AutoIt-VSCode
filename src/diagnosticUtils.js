import { Diagnostic, DiagnosticSeverity, Range, Position, Uri } from 'vscode';

/**
 * Returns the diagnostic severity based on the severity string.
 * @param {string} severityString - The severity string to convert to DiagnosticSeverity.
 * @returns {DiagnosticSeverity} - The DiagnosticSeverity based on the severity string.
 */
export const getDiagnosticSeverity = severityString => {
  switch (severityString) {
    case 'warning':
      return DiagnosticSeverity.Warning;
    default:
      return DiagnosticSeverity.Error;
  }
};

/**
 * Returns a diagnostic range for a given line and position.
 * @param {number} line - The line number.
 * @param {number} position - The position number.
 * @returns {Range} - The diagnostic range.
 */
export const getDiagnosticRange = (line, position) => {
  const diagnosticPosition = new Position(parseInt(line, 10) - 1, parseInt(position, 10) - 1);

  return new Range(diagnosticPosition, diagnosticPosition);
};

/**
 * Adds a new diagnostic to an object of diagnostics.
 * @param {Object} currentDiagnostics - The current diagnostics object.
 * @param {string} scriptPath - The path of the script that the diagnostic is for.
 * @param {Range} range - The range of the diagnostic.
 * @param {string} description - The description of the diagnostic.
 * @param {number} severity - The severity of the diagnostic.
 * @returns {Object} - The updated diagnostics object.
 */
export const updateDiagnostics = (currentDiagnostics, scriptPath, range, description, severity) => {
  const diagnosticToAdd = new Diagnostic(range, description, severity);
  const updatedDiagnostics = currentDiagnostics;

  if (!(scriptPath in updatedDiagnostics)) {
    updatedDiagnostics[scriptPath] = [];
  }
  updatedDiagnostics[scriptPath].push(diagnosticToAdd);

  return updatedDiagnostics;
};

/**
 * Processes the results of AU3Check, identifies warnings and errors.
 * @param {string} output Text returned from AU3Check.
 * @param {vscode.DiagnosticCollection} collection - The diagnostic collection to update.
 * @param {vscode.Uri} docURI - The URI of the document that was checked
 */
export const parseAu3CheckOutput = (output, collection, docURI) => {
  const OUTPUT_REGEXP = /"(?<scriptPath>.+)"\((?<line>\d{1,4}),(?<position>\d{1,4})\)\s:\s(?<severity>warning|error):\s(?<description>.+)\r/gm;
  let matches = null;
  let diagnosticRange;
  let diagnosticSeverity;
  let diagnostics = {};

  if (output.includes('- 0 error(s), 0 warning(s)')) {
    collection.delete(docURI);
    return;
  }

  matches = OUTPUT_REGEXP.exec(output);
  while (matches !== null) {
    diagnosticRange = getDiagnosticRange(matches.groups.line, matches.groups.position);
    diagnosticSeverity = getDiagnosticSeverity(matches.groups.severity);

    diagnostics = updateDiagnostics(
      diagnostics,
      matches.groups.scriptPath,
      diagnosticRange,
      matches.groups.description,
      diagnosticSeverity,
    );

    matches = OUTPUT_REGEXP.exec(output);
  }

  Object.keys(diagnostics).forEach(scriptPath => {
    collection.set(Uri.file(scriptPath), diagnostics[scriptPath]);
  });
};

export default parseAu3CheckOutput;

import * as vscode from 'vscode';

async function functionTraceAdd() {
  const sPattern = /()([Ff][Uu][Nn][Cc]\s+([^)\s]+)\(.*\))/;
  let lineOffset = 0;

  // Callback function to modify matched functions
  function patMatch(match, p1, p2, p3, offset) {
    const editor = vscode.window.activeTextEditor;

    // Check for existing trace statements and skipping comments
    if (/ConsoleWrite\(@@\(.*\)\)/.test(p1) || p1.includes('; FunctionTraceSkip')) {
      return match;
    }

    // Update line offset
    lineOffset++;

    // Construct trace statement
    const traceStatement = `ConsoleWrite('@@ (${editor.getLineFromPosition(offset) +
      lineOffset}) :(${new Date().toLocaleTimeString()}) ${p3}()') & vscode.workspace.eol + '\\t### Trace Function';`;

    // Replace matched function call
    return p1 + p2 + p3 + traceStatement;
  }

  // Remove existing trace statements
  vscode.window.activeTextEditor.replace(/ConsoleWrite\(@@\(.*\)\)/g, '');

  // Perform replacement using regular expressions
  const { document } = vscode.window.activeTextEditor;
  const replaceRange = new vscode.Range(
    0,
    document.lineAt(0).range.end,
    document.lineAt(document.lineCount - 1).range.end,
  );

  await document.edit(editBuilder => {
    editBuilder.replace(replaceRange, document.getText().replace(sPattern, patMatch));
  });
}

export default functionTraceAdd;

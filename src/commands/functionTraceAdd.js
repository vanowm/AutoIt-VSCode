import * as vscode from 'vscode';
import searchAndReplace from './commandUtils';

// Callback function to modify matched functions
function patMatch(match, p1, p2, p3) {
  // const editor = vscode.window.activeTextEditor;

  // Check for existing trace statements and skipping comments
  if (/ConsoleWrite\(@@\(.*\)\)/.test(p1) || p1.includes('; FunctionTraceSkip')) {
    return match;
  }

  // const matchLine = editor.document.positionAt(offset).line;

  const traceStatement = `ConsoleWrite('@@ (' @ScriptLineNumber ') :(' @MIN & ':' & @SEC & ') ${p3}()' & @CR) \t;### Trace Function'`;

  return `${match}\r${traceStatement}`;
}

async function functionTraceAdd() {
  const sPattern = /()(\bfunc\b\s+([^)\s]+)\(.*\))/gi;

  // Remove existing trace statements
  const traceStatementPattern = /\s*ConsoleWrite\('@@ \(.+;### Trace Function'/g;
  await searchAndReplace(traceStatementPattern);

  // Perform replacement using regular expressions
  const editor = vscode.window.activeTextEditor;
  const { document } = editor;
  const text = document.getText();

  const updatedText = text.replace(sPattern, patMatch);

  await editor.edit(editBuilder => {
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
    editBuilder.replace(fullRange, updatedText);
  });
}

export default functionTraceAdd;

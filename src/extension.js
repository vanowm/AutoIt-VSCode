const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const languageConfiguration = require('./languageConfiguration');
const hoverFeature = require('./ai_hover');
const completionFeature = require('./ai_completion');
const symbolsFeature = require('./ai_symbols');
const signaturesFeature = require('./ai_signature');
const workspaceSymbolsFeature = require('./ai_workspaceSymbols');
const goToDefinitionFeature = require('./ai_definition');

const { registerCommands } = require('./registerCommands');
const { parseAu3CheckOutput } = require('./diagnosticUtils');
const { config } = require('./ai_config').default;

const checkAutoItCode = (document, diagnosticCollection) => {
  let consoleOutput = '';

  if (!config.enableDiagnostics) {
    diagnosticCollection.clear();
    return;
  }

  if (document.languageId !== 'autoit') {
    return;
  }

  if (!fs.existsSync(config.checkPath)) {
    vscode.window.showErrorMessage(
      'Invalid Check Path! Please review AutoIt settings (Check Path in UI, autoit.checkPath in JSON)',
    );
    return;
  }
  const checkProcess = spawn(config.checkPath, [document.fileName], {
    cwd: path.dirname(document.fileName),
  });

  checkProcess.stdout.on('data', data => {
    if (data.length === 0) {
      return;
    }
    consoleOutput += data.toString();
  });

  checkProcess.stderr.on('error', error => {
    vscode.window.showErrorMessage(`${config.checkPath} error: ${error}`);
  });

  checkProcess.on('close', () => {
    parseAu3CheckOutput(consoleOutput, diagnosticCollection, document.uri);
  });
};

const activate = ctx => {
  const features = [
    hoverFeature,
    completionFeature,
    symbolsFeature,
    signaturesFeature,
    workspaceSymbolsFeature,
    goToDefinitionFeature,
  ];
  ctx.subscriptions.push(...features);

  ctx.subscriptions.push(
    vscode.languages.setLanguageConfiguration('autoit', languageConfiguration),
  );

  registerCommands();

  const diagnosticCollection = vscode.languages.createDiagnosticCollection('autoit');
  ctx.subscriptions.push(diagnosticCollection);

  vscode.workspace.onDidSaveTextDocument(document =>
    checkAutoItCode(document, diagnosticCollection),
  );
  vscode.workspace.onDidOpenTextDocument(document =>
    checkAutoItCode(document, diagnosticCollection),
  );
  vscode.workspace.onDidCloseTextDocument(document => {
    diagnosticCollection.delete(document.uri);
  });
  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      checkAutoItCode(editor.document, diagnosticCollection);
    }
  });

  // Run diagnostic on document that's open when the extension loads
  if (config.enableDiagnostics && vscode.window.activeTextEditor) {
    checkAutoItCode(vscode.window.activeTextEditor.document, diagnosticCollection);
  }

  // eslint-disable-next-line no-console
  console.log('AutoIt is now active!');
};

exports.activate = activate;

// this method is called when your extension is deactivated
// eslint-disable-next-line prettier/prettier
function deactivate() { }
exports.deactivate = deactivate;

import { window, languages, workspace } from 'vscode';
import { dirname } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import languageConfiguration from './languageConfiguration';
import hoverFeature from './ai_hover';
import completionFeature from './ai_completion';
import symbolsFeature from './ai_symbols';
import signaturesFeature from './ai_signature';
import workspaceSymbolsFeature from './ai_workspaceSymbols';
import goToDefinitionFeature from './ai_definition';

import { registerCommands } from './registerCommands';
import { parseAu3CheckOutput } from './diagnosticUtils';
import conf from './ai_config';

const { config } = conf;
const isWinOS = process.platform === 'win32';

let checkPathPrev;
const checkAutoItCode = (document, diagnosticCollection) => {
  if (!isWinOS)
    return;

  let consoleOutput = '';

  if (!config.enableDiagnostics) {
    diagnosticCollection.clear();
    return;
  }

  if (document.languageId !== 'autoit') {
    return;
  }

  const checkPath = config.checkPath;
  if (!existsSync(checkPath)) {
    if (checkPath !== checkPathPrev)
      window.showErrorMessage(
        'Invalid Check Path! Please review AutoIt settings (Check Path in UI, autoit.checkPath in JSON)',
      );

    checkPathPrev = checkPath;
    return;
  }
  const checkProcess = spawn(config.checkPath, [document.fileName], {
    cwd: dirname(document.fileName),
  });

  checkProcess.stdout.on('data', data => {
    if (data.length === 0) {
      return;
    }
    consoleOutput += data.toString();
  });

  checkProcess.stderr.on('error', error => {
    window.showErrorMessage(`${config.checkPath} error: ${error}`);
  });

  checkProcess.on('close', () => {
    parseAu3CheckOutput(consoleOutput, diagnosticCollection, document.uri);
  });
};

export const activate = ctx => {
  const features = [
    hoverFeature,
    completionFeature,
    symbolsFeature,
    signaturesFeature,
    workspaceSymbolsFeature,
    goToDefinitionFeature,
  ];
  ctx.subscriptions.push(...features);

  ctx.subscriptions.push(languages.setLanguageConfiguration('autoit', languageConfiguration));

  registerCommands(ctx);

  const diagnosticCollection = languages.createDiagnosticCollection('autoit');
  ctx.subscriptions.push(diagnosticCollection);

  workspace.onDidSaveTextDocument(document => checkAutoItCode(document, diagnosticCollection));
  workspace.onDidOpenTextDocument(document => checkAutoItCode(document, diagnosticCollection));
  workspace.onDidCloseTextDocument(document => {
    diagnosticCollection.delete(document.uri);
  });
  window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      checkAutoItCode(editor.document, diagnosticCollection);
    }
  });

  // Run diagnostic on document that's open when the extension loads
  if (config.enableDiagnostics && window.activeTextEditor) {
    checkAutoItCode(window.activeTextEditor.document, diagnosticCollection);
  }

  // eslint-disable-next-line no-console
  console.log('AutoIt is now active!');
};

// this method is called when your extension is deactivated
// eslint-disable-next-line prettier/prettier
export function deactivate() { }

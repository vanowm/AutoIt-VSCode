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
let diagnosticCollection;

const checkAutoItCode = document => {
  diagnosticCollection.clear();

  if (!config.enableDiagnostics) {
    return;
  }

  if (document.languageId !== 'autoit') {
    return;
  }

  if (!existsSync(config.checkPath)) {
    window.showErrorMessage(
      'Invalid Check Path! Please review AutoIt settings (Check Path in UI, autoit.checkPath in JSON)',
    );
    return;
  }
  const checkProcess = spawn(config.checkPath, [document.fileName], {
    cwd: dirname(document.fileName),
  });

  checkProcess.stdout.on('data', data => {
    if (data.length === 0) {
      return;
    }
    parseAu3CheckOutput(data.toString(), diagnosticCollection);
  });

  checkProcess.stderr.on('error', error => {
    window.showErrorMessage(`${config.checkPath} error: ${error}`);
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

  diagnosticCollection = languages.createDiagnosticCollection('autoit');

  workspace.onDidSaveTextDocument(document => checkAutoItCode(document));
  workspace.onDidOpenTextDocument(document => checkAutoItCode(document));
  window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      checkAutoItCode(editor.document);
    }
  });

  // eslint-disable-next-line no-console
  console.log('AutoIt is now active!');
};

// this method is called when your extension is deactivated
// eslint-disable-next-line prettier/prettier
export function deactivate() { }

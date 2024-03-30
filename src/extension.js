import { window, languages, workspace } from 'vscode';
import { dirname } from 'path';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import languageConfiguration from './languageConfiguration';
import hoverFeature from './ai_hover';
import completionFeature from './ai_completion';
import symbolsFeature from './ai_symbols';
import signaturesFeature, { signatureHoverProvider } from './ai_signature';
import workspaceSymbolsFeature from './ai_workspaceSymbols';
import goToDefinitionFeature from './ai_definition';

import { registerCommands } from './registerCommands';
import { parseAu3CheckOutput } from './diagnosticUtils';
import conf from './ai_config';

const { config } = conf;

/**
 * Runs the check process for the given file and returns the console output.
 * @param {string} fileName - The name of the file to check.
 * @returns {Promise<string>} A promise that resolves with the console output of the check process.
 */
const runCheckProcess = fileName => {
  return new Promise((resolve, reject) => {
    let consoleOutput = '';
    const checkProcess = execFile(
      config.checkPath,
      [
        '-w',
        1, // already included file
        '-w',
        2, // missing #comments-end
        '-w',
        3, // already declared var
        '-w',
        4, // local var used in global scope
        '-w',
        5, // local var declared but not used
        '-w',
        6, // warn when using Dim
        '-w',
        7, // warn when passing Const or expression on ByRef param(s)
        fileName,
      ],
      {
        cwd: dirname(fileName),
      },
    );

    checkProcess.stdout.on('data', data => {
      if (data.length === 0) {
        return;
      }
      console.log(data.toString());
      consoleOutput += data.toString();
    });

    checkProcess.stderr.on('error', error => {
      console.error(error);
      reject(error);
    });

    checkProcess.on('close', () => {
      resolve(consoleOutput);
    });
  });
};

const handleCheckProcessError = error => {
  window.showErrorMessage(`${config.checkPath} ${error}`);
};

const validateCheckPath = checkPath => {
  if (!existsSync(checkPath)) {
    window.showErrorMessage(
      'Invalid Check Path! Please review AutoIt settings (Check Path in UI, autoit.checkPath in JSON)',
    );
    return false;
  }
  return true;
};

/**
 * Checks the AutoIt code in the given document and updates the diagnostic collection.
 * @param {TextDocument} document - The document to check.
 * @param {DiagnosticCollection} diagnosticCollection - The diagnostic collection to update.
 */
const checkAutoItCode = async (document, diagnosticCollection) => {
  if (!config.enableDiagnostics) {
    diagnosticCollection.clear();
    return;
  }

  if (document.languageId !== 'autoit') return;

  const { checkPath } = config;
  if (!validateCheckPath(checkPath)) return;

  try {
    const consoleOutput = await runCheckProcess(document.fileName);
    parseAu3CheckOutput(consoleOutput, diagnosticCollection, document.uri);
  } catch (error) {
    handleCheckProcessError(error);
  }
};

export const activate = ctx => {
  const features = [
    hoverFeature,
    completionFeature,
    symbolsFeature,
    signaturesFeature,
    signatureHoverProvider,
    workspaceSymbolsFeature,
    goToDefinitionFeature,
  ];
  ctx.subscriptions.push(...features);

  ctx.subscriptions.push(languages.setLanguageConfiguration('autoit', languageConfiguration));

  registerCommands(ctx);

  if (process.platform === 'win32') {
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
  }

  // eslint-disable-next-line no-console
  console.log('AutoIt is now active!');
};

// this method is called when your extension is deactivated
// eslint-disable-next-line prettier/prettier
export function deactivate() { }

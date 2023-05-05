import { languages, workspace } from 'vscode';

import { provideDocumentSymbols } from './ai_symbols';

let symbolsCache = [];

async function getWorkspaceSymbols() {
  const symbols = [];
  const data = await workspace.findFiles('**/*.{au3,a3x}');
  // const foundVars = new Set();

  await Promise.all(
    data.map(async file => {
      const thisDocument = await workspace.openTextDocument(file);
      const fileSymbols = provideDocumentSymbols(thisDocument);

      symbols.push(...fileSymbols);
    }),
  );

  return symbols;
}

async function provideWorkspaceSymbols() {
  if (symbolsCache.length === 0) {
    symbolsCache = await getWorkspaceSymbols();
  }
  return symbolsCache;
}

const watcher = workspace.createFileSystemWatcher('**/*.{au3,a3x}');
watcher.onDidChange(() => {
  symbolsCache = [];
});
watcher.onDidCreate(() => {
  symbolsCache = [];
});
watcher.onDidDelete(() => {
  symbolsCache = [];
});

const workspaceSymbolProvider = languages.registerWorkspaceSymbolProvider({
  provideWorkspaceSymbols,
});

export default workspaceSymbolProvider;

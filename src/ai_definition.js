import { languages, Location, Position, Uri } from 'vscode';
import { AUTOIT_MODE, getIncludePath, getIncludeText, getIncludeScripts } from './util';

const AutoItDefinitionProvider = {
  provideDefinition(document, position) {
    const lookupRange = document.getWordRangeAtPosition(position);
    const lookup = document.getText(lookupRange);
    const docText = document.getText();
    let defRegex;

    if (lookup.charAt(0) === '$') {
      defRegex = new RegExp(`((?:Local|Global|Const)\\s*)?\\${lookup}\\s+?=?`, 'i');
    } else {
      defRegex = new RegExp(`(Func\\s+)${lookup}\\s*\\(`);
    }

    let found = docText.match(defRegex);

    if (found) {
      return new Location(document.uri, document.positionAt(found.index + (found[1] || '').length));
    }

    // If nothing was found, search include files
    const scriptsToSearch = [];
    getIncludeScripts(document, docText, scriptsToSearch);

    if (scriptsToSearch.length) {
      found = null;
      for (let i = 0; i < scriptsToSearch.length; i += 1) {
        const scriptPath = getIncludePath(scriptsToSearch[i], document);
        const scriptContent = getIncludeText(scriptPath);

        found = scriptContent.match(defRegex);

        if (found) {
          const arr = scriptContent.slice(0, found.index + (found[1] || '').length).split('\n');
          const line = arr.length - 1;
          const char = arr[arr.length - 1].length;

          return new Location(Uri.file(scriptPath), new Position(line, char));
        }
      }
    }

    return null;
  },
};

const defProvider = languages.registerDefinitionProvider(AUTOIT_MODE, AutoItDefinitionProvider);

export default defProvider;

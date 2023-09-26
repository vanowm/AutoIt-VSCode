import { languages, Location, Position, Uri } from 'vscode';
import { AUTOIT_MODE, getIncludePath, getIncludeText, getIncludeScripts } from './util';

const AutoItDefinitionProvider = {
  /**
   * Finds the definition of a word in a document and returns its location.
   * @param {TextDocument} document - The document in which to search for the word definition.
   * @param {Position} position - The position of the word for which to find the definition.
   * @returns {Location|null} - The location of the word definition, or null if not found.
   */
  provideDefinition(document, position) {
    const lookupRange = document.getWordRangeAtPosition(position);
    const lookupText = document.getText(lookupRange);
    const documentText = document.getText();

    const definitionRegex = this.determineRegex(lookupText);
    let match = documentText.match(definitionRegex);

    if (match) {
      return new Location(document.uri, document.positionAt(match.index + (match[1] || '').length));
    }

    // If nothing was found, search include files
    match = this.findDefinitionInIncludeFiles(documentText, definitionRegex, document);

    if (match.found) {
      const { scriptPath } = match;
      const scriptContentBeforeMatch = match.scriptContent
        .slice(0, match.found.index + (match[1] || '').length)
        .split('\n');
      const matchLine = scriptContentBeforeMatch.length - 1;
      const matchCharacterIndex =
        scriptContentBeforeMatch[scriptContentBeforeMatch.length - 1].length;
      return new Location(Uri.file(scriptPath), new Position(matchLine, matchCharacterIndex));
    }

    return null;
  },

  /**
   * Determines the regex for a given lookup string.
   * @param {string} lookup - The lookup string.
   * @returns {RegExp} The regex for the lookup string.
   */
  determineRegex(lookup) {
    const variableRegex = /(?<![;].*)(?<!(?:#cs|#comments-start).*)((?:Local|Global|Const)\s*)?@(?:\[[\w\d\\$]+\])?\s*=?.*(?![^#]*(#ce|#comments-end))/;

    if (lookup.startsWith('$')) {
      return new RegExp(variableRegex.source.replace('@', `\\${lookup}\\b`), 'i');
    }
    return new RegExp(
      `(?<![;].*)(?<!(?:#cs|#comments-start).*)(Func\\s+)${lookup}\\s*\\((?![^#]*(#ce|#comments-end))`,
    );
  },

  /**
   * Searches the included scripts in a document for a definition matching a regular expression.
   * @param {string} docText - The text of the document.
   * @param {RegExp} defRegex - The regular expression to search for.
   * @param {TextDocument} document - The document being searched.
   * @returns {object|null} - An object containing information about the found definition, or null if not found.
   */
  findDefinitionInIncludeFiles(docText, defRegex, document) {
    const scriptsToSearch = [];
    getIncludeScripts(document, docText, scriptsToSearch);

    const searchScript = (script, returnObject = false) => {
      const scriptPath = getIncludePath(script, document);
      const scriptContent = getIncludeText(scriptPath);
      const found = scriptContent.match(defRegex);

      if (returnObject) return { scriptPath, scriptContent, found };

      return found;
    };

    const match = scriptsToSearch.find(searchScript);

    if (match) {
      return searchScript(match, true);
    }

    return null;
  },
};

const defProvider = languages.registerDefinitionProvider(AUTOIT_MODE, AutoItDefinitionProvider);

export default defProvider;

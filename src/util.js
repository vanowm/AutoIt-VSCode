const fs = require('fs');
const path = require('path');
const { CompletionItemKind, workspace, MarkdownString } = require('vscode');

const descriptionHeader = '|Description |Value |\n|:---|:---:|\n';
const valueFirstHeader = '\n|&nbsp;|&nbsp;&nbsp;&nbsp; |&nbsp;\n|---:|:---:|:---|';
const trueFalseHeader = `\n|&nbsp;|&nbsp;&nbsp;&nbsp;|&nbsp;
    :---|:---:|:---`;
const opt = '**[optional]**';
const br = '\u0020\u0020';
const defaultZero = `${br + br}\`Default = 0\``;

const setDetailAndDocumentation = (array, detail, doc) => {
  const newArray = array.map(item => {
    return { ...item, detail, documentation: `${item.documentation}\n\n*${doc}*` };
  });

  return newArray;
};

const AI_CONSTANTS = [
  '$MB_ICONERROR',
  '$MB_ICONINFORMATION',
  '$MB_YESNO',
  '$MB_TASKMODAL',
  '$IDYES',
  '$IDNO',
];
const AUTOIT_MODE = { language: 'autoit', scheme: 'file' };

const isSkippableLine = line => {
  if (line.isEmptyOrWhitespace) {
    return true;
  }

  const firstChar = line.text.charAt(line.firstNonWhitespaceCharacterIndex);
  if (firstChar === ';') {
    return true;
  }

  if (firstChar === '#') {
    if (/^\s*#(cs|ce|comments-start|comments-end)/.test(line.text)) {
      return false;
    }
    return true;
  }

  return false;
};

const getIncludeText = filePath => {
  return fs.readFileSync(filePath).toString();
};

const getIncludePath = (fileOrPath, document) => {
  let includePath = '';

  if (fileOrPath.charAt(1) === ':') {
    includePath = fileOrPath;
  } else {
    let docDir = path.dirname(document.fileName);

    docDir +=
      (fileOrPath.charAt(0) === '\\' || fileOrPath.charAt(0) === '/' ? '' : '\\') + fileOrPath;
    includePath = path.normalize(docDir);
  }

  includePath = includePath.charAt(0).toUpperCase() + includePath.slice(1);

  return includePath;
};

/**
 * Generates a new array of Completions that include a common kind, detail and
 * potentially commitCharacter(s)
 * @param {*} entries The array of Completions to be modified
 * @param {*} kind The enum value of CompletionItemKind to determine icon
 * @param {*} detail Additional information about the entries
 * @param {*} requiredScript Script where completion is defined
 * @returns Returns an array of Completion objects
 */
const fillCompletions = (entries, kind, detail = '', requiredScript = '') => {
  let commitCharacters;
  let newDoc;
  let newDetail;

  const filledCompletion = entries.map(entry => {
    commitCharacters = kind === CompletionItemKind.Function ? ['('] : [];
    newDoc = new MarkdownString(entry.documentation);
    if (requiredScript) newDoc.appendCodeblock(`#include <${requiredScript}>`, 'autoit');

    newDetail = entry.detail ? entry.detail + detail : detail;

    return {
      ...entry,
      kind,
      detail: newDetail,
      commitCharacters,
      documentation: newDoc,
    };
  });

  return filledCompletion;
};

/**
 * Generates an object of Hover objects for a set of signatures
 * @param signatures An object containing Signature objects
 * @returns Returns an empty object or with Hover objects
 */
const signatureToHover = signatures => {
  let hoverObjects = {};
  const sigKeys = Object.keys(signatures);
  sigKeys.forEach(item => {
    hoverObjects = {
      ...hoverObjects,
      [item]: [signatures[item].documentation, `\`\`\`\r${signatures[item].label}\r\`\`\``],
    };
  });

  return hoverObjects;
};

/**
 * Generates an object of Hover objects from completions
 * @param completions An object containing Completions
 * @returns Returns an empty object or Hover objects
 */
const completionToHover = completions => {
  const hoverObjects = {};

  completions.forEach(item => {
    hoverObjects[item.label] = item.documentation;
  });

  return hoverObjects;
};

const includePattern = /^#include\s"(.+)"/gm;
const functionPattern = /^[\t ]{0,}Func\s(.+)\(/i;
const variablePattern = /(?:["'].*?["'])|(?:;.*)|(\$\w+)/g;
const regionPattern = /^[\t ]{0,}#region\s[- ]{0,}(.+)/i;
const libraryIncludePattern = /^#include\s+<([\w.]+\.au3)>/gm;

/**
 * Generates an array of Completions from a signature object
 * @param signatures Signature object
 * @param kind The CompletionItemKind
 * @param detail A human-readable string with additional information about this item, like type or symbol information.
 * @returns {Array} an array of completions
 */
const signatureToCompletion = (signatures, kind, detail) => {
  const completionSet = Object.keys(signatures).map(key => {
    return { label: key, documentation: signatures[key].documentation, kind, detail };
  });

  return completionSet;
};

/**
 * Checks a filename with the include paths for a valid path
 * @param {string} file - the filename to append to the paths
 * @param {boolean} library - Search Autoit library first?
 * @returns {(string|boolean)} Full path if found to exist or false
 */
const findFilepath = (file, library = true) => {
  // work with copy to avoid changing main config
  const includePaths = [...workspace.getConfiguration('autoit').get('includePaths')];
  if (!library) {
    // move main library entry to the bottom so that it is searched last
    includePaths.push(includePaths.shift());
  }

  let newPath;
  const pathFound = includePaths.some(iPath => {
    newPath = path.normalize(`${iPath}\\`) + file;
    if (fs.existsSync(newPath)) {
      return true;
    }
    return false;
  });

  if (pathFound && newPath) {
    return newPath;
  }
  return false;
};

/**
 * Generates an array of Include scripts to search
 * that includes the full range of the region's body
 * @param {TextDocument} document The current document to search
 * @param {String} docText The text from the document
 * @param {Array} scriptsToSearch The destination array
 * @returns SymbolInformation
 */
const getIncludeScripts = (document, docText, scriptsToSearch) => {
  const relativeInclude = /^\s*#include\s"(.+)"/gm;
  const libraryInclude = /^\s*#include\s<(.+)>/gm;
  let includeFile;
  let scriptContent;

  let found = relativeInclude.exec(docText);
  while (found) {
    // Check if file exists in document directory
    includeFile = getIncludePath(found[1], document);
    if (!fs.existsSync(includeFile)) {
      // Find first instance using include paths
      includeFile = findFilepath(found[1], false);
    }
    if (includeFile && scriptsToSearch.indexOf(includeFile) === -1) {
      scriptsToSearch.push(includeFile);
      scriptContent = getIncludeText(includeFile);
      getIncludeScripts(document, scriptContent, scriptsToSearch);
    }
    found = relativeInclude.exec(docText);
  }

  found = libraryInclude.exec(docText);
  while (found) {
    // Find first instance using include paths
    includeFile = findFilepath(found[1], false);
    if (includeFile && scriptsToSearch.indexOf(includeFile) === -1) {
      scriptsToSearch.push(includeFile);
      scriptContent = getIncludeText(includeFile);
      getIncludeScripts(document, scriptContent, scriptsToSearch);
    }
    found = libraryInclude.exec(docText);
  }
};

const getParams = paramText => {
  let params = {};

  if (paramText) {
    paramText.split(',').forEach(param => {
      params = {
        ...params,
        [param]: {
          label: param.trim(),
          documentation: '',
        },
      };
    });
  }

  return params;
};

/**
 * Returns an object of AutoIt functions found within a VSCode TextDocument
 * @param {string} fileName
 * @param {vscode.TextDocument} doc
 * @returns {Object} Object of functions in file
 */
const getIncludeData = (fileName, doc) => {
  // console.log(fileName)
  const includeFuncPattern = /(?=\S)(?!;~\s)Func\s+((\w+)\((.+)?\))/gi;
  const functions = {};
  let filePath = getIncludePath(fileName, doc);
  if (!fs.existsSync(filePath)) {
    // Find first instance using include paths
    filePath = findFilepath(fileName, false);
  }
  let pattern = null;
  const fileData = getIncludeText(filePath);
  do {
    pattern = includeFuncPattern.exec(fileData);
    if (pattern) {
      functions[pattern[2]] = {
        label: pattern[1],
        documentation: `Function from ${fileName}`,
        params: getParams(pattern[3]),
      };
    }
  } while (pattern);

  return functions;
};

module.exports = {
  descriptionHeader,
  valueFirstHeader,
  setDetail: setDetailAndDocumentation,
  opt,
  trueFalseHeader,
  br,
  AI_CONSTANTS,
  defaultZero,
  AUTOIT_MODE,
  isSkippableLine,
  getIncludeText,
  getIncludePath,
  fillCompletions,
  signatureToHover,
  includePattern,
  functionPattern,
  variablePattern,
  regionPattern,
  libraryIncludePattern,
  completionToHover,
  signatureToCompletion,
  findFilepath,
  getIncludeData,
  getParams,
  getIncludeScripts,
};

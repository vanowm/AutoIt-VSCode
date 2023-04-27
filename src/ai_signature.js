import {
  languages,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  MarkdownString,
} from 'vscode';
import {
  includePattern,
  findFilepath,
  libraryIncludePattern,
  getIncludeData,
  AUTOIT_MODE,
  buildFunctionSignature,
  functionDefinitionRegex,
} from './util';
import defaultSigs from './signatures';
import DEFAULT_UDFS from './constants';

let currentIncludeFiles = [];
let includes = {};

/**
 * Reduces a partial line of code to the current Function for parsing
 * @param {string} code The line of code
 */
function getParsableCode(code) {
  const reducedCode = code
    .replace(/\w+\([^()]*\)/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/'[^']*'/g, '') // Remove double/single quote sets
    .replace(/"[^"]*(?=$)/g, '') // Remove double quote and text at end of line
    .replace(/'[^']*(?=$)/g, '') // Remove single quote and text at end of line
    .replace(/\([^()]*\)/g, '') // Remove paren sets
    .replace(/\({2,}/g, '('); // Reduce multiple open parens

  return reducedCode;
}

function getCurrentFunction(code) {
  const parenSplit = code.split('(');

  if (parenSplit.length > 1) {
    // Get the 2nd to last item (right in front of last open paren)
    // and clean up the results
    const parenMatch = parenSplit[parenSplit.length - 2].match(/(.*)\b(\w+)/);

    if (parenMatch) {
      return parenMatch[2];
    }
  }

  return null;
}

function countCommas(code) {
  // Find the position of the closest/last open paren
  const openParen = code.lastIndexOf('(');
  // Count non-string commas in text following open paren
  let commas = code.slice(openParen).match(/(?!\B["'][^"']*),(?![^"']*['"]\B)/g);
  if (commas === null) {
    commas = 0;
  } else {
    commas = commas.length;
  }

  return commas;
}

function getCallInfo(doc, pos) {
  // Acquire the text up the point where the current cursor/paren/comma is at
  const codeAtPosition = doc.lineAt(pos.line).text.substring(0, pos.character);
  const cleanCode = getParsableCode(codeAtPosition);

  return {
    func: getCurrentFunction(cleanCode),
    commas: countCommas(cleanCode),
  };
}

function arraysMatch(arr1, arr2) {
  if (arr1.length === arr2.length && arr1.some(v => arr2.indexOf(v) <= 0)) {
    return true;
  }
  return false;
}

function getIncludes(doc) {
  // determines whether includes should be re-parsed or not.
  const text = doc.getText();

  let includesCheck = [];
  let pattern;
  do {
    pattern = includePattern.exec(text);
    if (pattern) {
      includesCheck.push(pattern[1]);
    }
  } while (pattern);

  if (!arraysMatch(includesCheck, currentIncludeFiles)) {
    includes = {};
    includesCheck.forEach(script => {
      const newIncludes = getIncludeData(script, doc);
      Object.assign(includes, newIncludes);
    });
    currentIncludeFiles = includesCheck;
  }

  includesCheck = [];

  let filename = '';
  let fullPath = '';
  let newData = '';
  do {
    pattern = libraryIncludePattern.exec(text);
    if (pattern) {
      filename = pattern[1].replace('.au3', '');
      if (DEFAULT_UDFS.indexOf(filename) === -1) {
        fullPath = findFilepath(pattern[1]);
        if (fullPath) {
          newData = getIncludeData(fullPath, doc);
          Object.assign(includes, newData);
        }
      }
    }
  } while (pattern);

  return includes;
}

/**
 * Returns an object of AutoIt functions found within the current AutoIt script
 * @param {vscode.TextDocument} doc The  TextDocument object representing the AutoIt script
 * @returns {Object} Object containing SignatureInformation objects
 */
function getLocalSigs(doc) {
  const text = doc.getText();
  const functions = {};

  let functionMatch = functionDefinitionRegex.exec(text);
  while (functionMatch) {
    const functionData = buildFunctionSignature(functionMatch, text, doc.fileName);
    functions[functionData.functionName] = functionData.functionObject;
    functionMatch = functionDefinitionRegex.exec(text);
  }

  return functions;
}

/**
 * Creates a SignatureInformation object from a given signature.
 * @param {Object} foundSig - The signature to create the SignatureInformation object from.
 * @returns {SignatureInformation} The created SignatureInformation object.
 */
function createSignatureInfo(foundSig) {
  const signatureInfo = new SignatureInformation(
    foundSig.label,
    new MarkdownString(`##### ${foundSig.documentation}`),
  );
  signatureInfo.parameters = Object.keys(foundSig.params).map(
    key =>
      new ParameterInformation(
        foundSig.params[key].label,
        new MarkdownString(foundSig.params[key].documentation),
      ),
  );
  return signatureInfo;
}

export default languages.registerSignatureHelpProvider(
  AUTOIT_MODE,
  {
    /**
     * Provides signature help for a given document and position.
     * @param {TextDocument} document - The document to provide signature help for.
     * @param {Position} position - The position in the document to provide signature help for.
     * @returns {SignatureHelp | null} The signature help or null if no help is available.
     */
    provideSignatureHelp(document, position) {
      const caller = getCallInfo(document, position);
      if (!caller.func) return null;

      const allSignatures = { ...defaultSigs, ...getIncludes(document), ...getLocalSigs(document) };

      const matchedSignature = allSignatures[caller.func];
      if (!matchedSignature) return null;

      const result = new SignatureHelp();
      result.signatures = [createSignatureInfo(matchedSignature)];
      result.activeSignature = 0;
      result.activeParameter = caller.commas;
      return result;
    },
  },
  '(',
  ',',
);

import { languages, Location, SymbolInformation, SymbolKind, workspace, Range } from 'vscode';
import {
  AI_CONSTANTS,
  AUTOIT_MODE,
  isSkippableLine,
  functionPattern,
  variablePattern,
  regionPattern,
} from './util';

const config = workspace.getConfiguration('autoit');
const commentEndRegex = /^\s*#(?:ce|comments-end)/;
const commentStartRegex = /^\s*#(?:cs|comments-start)/;
const continuationRegex = /\s_\b\s*(;.*)?\s*/;

const createVariableSymbol = (variable, variableKind, doc, line, container) => {
  return new SymbolInformation(
    variable,
    variableKind,
    container,
    new Location(doc.uri, line.range),
  );
};

/**
 * Generates a SymbolInformation object for a function from a given TextDocument
 * that includes the full range of the function's body
 * @param {String} functionName The name of the function from the AutoIt script
 * @param {TextDocument} doc The current document to search
 * @param {Number} lineNum The function's starting line number within the document
 * @returns SymbolInformation
 */
const createFunctionSymbol = (functionName, doc, lineNum) => {
  const pattern = new RegExp(
    // `^Func\\s+\\b(?<funcName>${functionName}\\b).*\\n(?:(?!EndFunc\\b).*\\n)*EndFunc.*\\n?`
    `[\t ]*(?:volatile[\t ]+)?Func[\t ]+\\b(?<funcName>${functionName}+\\b).*?(EndFunc)`,
    'gsi',
  );
  const docText = doc.getText();

  // Establish starting position for regex search
  pattern.lastIndex = doc.offsetAt(doc.lineAt(lineNum).range.start);
  const result = pattern.exec(docText);
  if (result === null) {
    return null;
  }
  const endPoint = result.index + result[0].length;
  const newFunctionSymbol = new SymbolInformation(
    result[1],
    SymbolKind.Function,
    '',
    new Location(doc.uri, new Range(doc.positionAt(result.index), doc.positionAt(endPoint))),
  );

  return newFunctionSymbol;
};

/**
 * Generates a SymbolInformation object for a Region from a given TextDocument
 * that includes the full range of the region's body
 * @param {String} regionName The name of the region from the AutoIt script
 * @param {TextDocument} doc The current document to search
 * @param {String} docText The text from the document (usually generated through `TextDocument.getText()`)
 * @returns SymbolInformation
 */
const createRegionSymbol = (regionName, doc, docText) => {
  const cleanRegionName = regionName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const pattern = new RegExp(`#Region\\s[- ]{0,}(${cleanRegionName}).*?#EndRegion`, 's');

  const result = pattern.exec(docText);
  if (result === null) {
    return null;
  }
  const endPoint = result.index + result[0].length;
  const newRegionSymbol = new SymbolInformation(
    result[1],
    SymbolKind.Namespace,
    '',
    new Location(doc.uri, new Range(doc.positionAt(result.index), doc.positionAt(endPoint))),
  );

  return newRegionSymbol;
};

const parseFunctionFromText = params => {
  const { text, processedSymbols, doc, lineNum, result } = params;

  const funcName = text.match(functionPattern);
  if (!funcName || processedSymbols.has(funcName[0])) return;

  const functionSymbol = createFunctionSymbol(funcName[1], doc, lineNum);
  if (!functionSymbol) return;

  result.push(functionSymbol);
  processedSymbols.add(funcName[1]);
};

const parseRegionFromText = params => {
  if (!config.showRegionsInGoToSymbol) return;

  const { regionName, found, doc, result } = params;
  if (!regionName || found.has(regionName[0])) return;

  const regionSymbol = createRegionSymbol(regionName[1], doc, doc.getText());
  if (!regionSymbol) return;
  result.push(regionSymbol);
  found.add(regionName[0]);
};

const variableConstantRegex = /^\s*?(Local|Global)?\sConst/;
const variableEnumRegex = /^\s*?(Local|Global)?\sEnum/;
const delims = ["'", '"', ';'];

function findVariableContainer(result, line) {
  return (
    result.find(
      testSymbol =>
        testSymbol.location.range.contains(line.range) && testSymbol.kind === SymbolKind.Function,
    ) || ''
  );
}

/**
 * Check whether a variable with the specified name and container is present in the given array of symbols.
 *
 * @param {Array} result - The array of symbols to search for the variable.
 * @param {string} variable - The name of the variable to search for.
 * @param {Object} container - The container object that the variable is expected to be found in.
 * @returns {boolean} `true` if the variable is found in the symbols array, `false` otherwise.
 */
const isVariableInResults = (result, variable, container) => {
  return !!result.find(
    symbol => symbol.name === variable && symbol.containerName === container.name,
  );
};

function parseVariablesFromtext(params) {
  const { text, result, line, found, doc } = params;
  let { inContinuation, variableKind } = params;

  if (!config.showVariablesInGoToSymbol) return { inContinuation, variableKind };

  const variables = text.match(variablePattern);
  if (!variables) return { inContinuation, variableKind };

  if (!inContinuation) {
    if (variableConstantRegex.test(text)) {
      variableKind = SymbolKind.Constant;
    } else if (variableEnumRegex.test(text)) {
      variableKind = SymbolKind.Enum;
    } else {
      variableKind = SymbolKind.Variable;
    }
  }

  inContinuation = continuationRegex.test(text);

  for (let i = 0; i < variables.length; i += 1) {
    const variable = variables[i];
    if (!AI_CONSTANTS.includes(variable) && !delims.includes(variable.charAt(0))) {
      const container = findVariableContainer(result, line);

      if (!isVariableInResults(result, variable, container)) {
        result.push(createVariableSymbol(variable, variableKind, doc, line, container.name));
        found.add(variable);
      }
    }
  }

  return { inContinuation, variableKind };
}

function provideDocumentSymbols(doc) {
  const result = [];
  const processedSymbols = new Set();
  let inComment = false;
  let inContinuation = false;
  let variableKind;

  const lineCount = Math.min(doc.lineCount, 10000);
  for (let lineNum = 0; lineNum < lineCount; lineNum += 1) {
    const line = doc.lineAt(lineNum);
    const { text } = line;
    const regionName = text.match(regionPattern);

    if (isSkippableLine(line) && !regionName) {
      // eslint-disable-next-line no-continue
      continue;
    }

    if (commentEndRegex.test(text)) {
      inComment = false;
      // eslint-disable-next-line no-continue
      continue;
    }

    if (commentStartRegex.test(text)) {
      inComment = true;
    }

    if (inComment) {
      // eslint-disable-next-line no-continue
      continue;
    }

    parseFunctionFromText({ text, processedSymbols, doc, lineNum, result });

    ({ inContinuation, variableKind } = parseVariablesFromtext({
      inContinuation,
      text,
      found: processedSymbols,
      doc,
      result,
      line,
      variableKind,
    }));

    parseRegionFromText({ regionName, found: processedSymbols, doc, result });
  }

  return result;
}

export default languages.registerDocumentSymbolProvider(AUTOIT_MODE, { provideDocumentSymbols });
export { provideDocumentSymbols };

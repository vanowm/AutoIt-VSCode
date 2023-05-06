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
  const { text, found, doc, lineNum, result } = params;

  const funcName = text.match(functionPattern);
  if (!funcName || found.has(funcName[0])) return;

  const functionSymbol = createFunctionSymbol(funcName[1], doc, lineNum);
  if (!functionSymbol) return;

  result.push(functionSymbol);
  found.add(funcName[1]);
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

const parseVariablesFromtext = params => {
  const delims = ["'", '"', ';'];
  const { text, result, line, found, doc } = params;
  let { inContinuation, variableKind } = params;

  if (!config.showVariablesInGoToSymbol) return;

  if (!inContinuation) {
    if (/^\s*?(Local|Global)?\sConst/.test(text)) {
      variableKind = SymbolKind.Constant;
    } else if (/^\s*?(Local|Global)?\sEnum/.test(text)) {
      variableKind = SymbolKind.Enum;
    } else {
      variableKind = SymbolKind.Variable;
    }
  }

  inContinuation = continuationRegex.test(text);

  const variables = text.match(variablePattern);
  if (!variables) return;

  variables.forEach(variable => {
    if (AI_CONSTANTS.includes(variable)) {
      return;
    }

    // ignore strings beginning with preset delimiters
    if (delims.includes(variable.charAt(0))) {
      return;
    }

    // Go through symbols for function container and symbols that match name and container
    let container = result.find(testSymbol => {
      return (
        testSymbol.location.range.contains(line.range) && testSymbol.kind === SymbolKind.Function
      );
    });

    if (container === undefined) {
      container = '';
    }

    if (
      result.some(testSymbol => {
        return testSymbol.name === variable && testSymbol.containerName === container.name;
      })
    ) {
      return;
    }

    result.push(createVariableSymbol(variable, variableKind, doc, line, container.name));
    found.add(variable);
  });
};

function provideDocumentSymbols(doc) {
  const result = [];
  const found = new Set();
  let inComment = false;
  let inContinuation = false;
  let variableKind;

  // Get the number of lines in the document to loop through
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

    parseFunctionFromText({ text, found, doc, lineNum, result });

    parseVariablesFromtext({ inContinuation, text, found, doc, result, line, variableKind });

    parseRegionFromText({ regionName, found, doc, result });
  }

  return result;
}

export default languages.registerDocumentSymbolProvider(AUTOIT_MODE, { provideDocumentSymbols });
export { provideDocumentSymbols };

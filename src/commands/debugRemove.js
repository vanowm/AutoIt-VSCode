import * as vscode from 'vscode';

/**
 * Searches for matches of a regular expression pattern in the active text editor's document
 * and replaces them with a replacement string.
 * @param {RegExp} regex - The regular expression pattern to search for.
 * @param {string} [replacement='\r\n'] - The string to replace the matched patterns with.
 * @returns {Promise<number>} A promise that resolves to the number of replacements made.
 */
async function searchAndReplace(regex, replacement = '\r\n') {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return 0;
  }

  const { document } = editor;
  const text = document.getText();

  const updatedText = text.replace(regex, replacement);

  if (updatedText === text) {
    return 0;
  }

  await editor.edit(editBuilder => {
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
    editBuilder.replace(fullRange, updatedText);
  });

  return (text.match(regex) || []).length;
}
/**
 * Removes debug lines from an AutoIt Script.
 *
 * This function uses regular expressions to find and replace the debug lines in the active text editor.
 * If any replacements are made, it displays a success message.
 * Otherwise, it displays a message indicating that no debug lines were found.
 *
 * @returns {Promise<void>} A promise that resolves once the debug lines are removed.
 */
async function debugRemove() {
  const consoleWriteDebugPattern = /\s+?(;~?\s+)?;### Debug CONSOLE.*?\r\n\s?(;~?\s+)?ConsoleWrite\('@@ Debug\('.+\r\n/g;
  const msgBoxDebugPattern = /\s+?(;~?\s+)?;### Debug MSGBOX.*?\r\n\s?(;~?\s+)?MsgBox\(262144, 'Debug line ~'.+\r\n/g;

  const consoleWriteReplacementsMade = await searchAndReplace(consoleWriteDebugPattern);
  const msgBoxReplacementsMade = await searchAndReplace(msgBoxDebugPattern);

  if (consoleWriteReplacementsMade || msgBoxReplacementsMade) {
    vscode.window.showInformationMessage(
      `${consoleWriteReplacementsMade + msgBoxReplacementsMade} Debug line(s) removed successfully`,
    );
  } else {
    vscode.window.showInformationMessage('No debug lines found');
  }
}

export default debugRemove;

import * as vscode from 'vscode';
import * as path from 'path';

import {
    getFileDict,
    setFileDict,
    getIsAutoUpd,
    setIsAutoUpd,
} from '../state';

// Updates the line numbers in the document
// Called on document change or command execution
export async function editLineNumbers(document: vscode.TextDocument, asCommand: boolean = false) {
    const fileName = path.basename(document.fileName);
    const fileDict = getFileDict();
    if (!(fileName in fileDict)) return;

    let [startLine, endLine, lineEditsEnabled, totalLines, processedLines] = fileDict[fileName] || [0, 0, false, 0, 0];

    if (!lineEditsEnabled || endLine === undefined) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // Check if auto-renumbering is enabled
    const config = vscode.workspace.getConfiguration('fanuctpp');
    const autoLineRenum = config.get('autoLineRenumber', true);
    if (!autoLineRenum && !asCommand) return;

    const position = editor.selection.active;
    let lineNumber = position.line + 1;
    const inRange = startLine - 1 < lineNumber && lineNumber < endLine;
    if (!inRange) return;

    const diff = Math.abs(totalLines - processedLines);
    if (diff < 1 && !asCommand) return;

    const text = document.getText();
    const lines = text.split(/\r?\n/);
    let tpLines = lines.slice(startLine, endLine - 1);

    const edits: vscode.TextEdit[] = [];
    setIsAutoUpd(true);

    // Regex patterns
    const blankLineRegex = /^\s*$/;
    const lineNumRegex = /^\s*\d+:/;
    const contLineRegex = /^\s*:/;
    const noSemiNumRegex = /^\s*(\d{1,4}):\s*$/;
    const noSemiWordRegex = /^\s*(\d{1,4}):\s*[^;]*$/;
    const twoSemiEndRegex = /\s*;\s*;\s*$/;
    const onlySemiRegex = /^\s*(\d{1,4}:)?\s*;$/;
    const betweenSemiRegex = /^\s*(\d{1,4}:|\s*)\s*;([^;]*);$/;
    const moveRegex = /(^\s*(\d{1,4}):|\s+)\s*[JL]\s/;

    let lineContCnt = 0;
    let inCont = false;
    let prevLineText = "";
    let movedPosition = false;

    for (let i = 0; i < tpLines.length && i <= endLine - 1; i++) {
        let lineText = tpLines[i];
        let tpLineNum = i + 1 - lineContCnt;
        let tpLineText = tpLineNum.toString().padStart(4, ' ');

        if (blankLineRegex.test(lineText)) {
            if (inCont) {
                edits.pop();
                inCont = false;
                prevLineText = prevLineText.replace(/(\s*; ;\s*\s*$|\s*;*\s*$)/, ' ;');
                const prevLineLength = document.lineAt(startLine + i - 1).text.length;
                edits.push(vscode.TextEdit.replace(new vscode.Range(startLine + i - 1, 0, startLine + i - 1, prevLineLength), prevLineText));
            }
            lineText = tpLineText + ":   ;";
        }
        else if (contLineRegex.test(lineText)) {
            if (!inCont) {
                edits.pop();
                inCont = true;
                prevLineText = prevLineText.replace(/\s*;+\s*$/, ' ');
                const prevLineLength = document.lineAt(startLine + i - 1).text.length;
                edits.push(vscode.TextEdit.replace(new vscode.Range(startLine + i - 1, 0, startLine + i - 1, prevLineLength), prevLineText));
            }
            lineContCnt++;
        }
        else if (twoSemiEndRegex.test(lineText)) {
            lineText = tpLineText + ":" + lineText.slice(5).replace(twoSemiEndRegex, ' ;');
            if (onlySemiRegex.test(lineText)) {
                lineText = tpLineText + ":   ;";
            }
            if (inCont) {
                edits.pop();
                inCont = false;
                prevLineText = prevLineText.replace(/(\s*; ;\s*\s*$|\s*;*\s*$)/, ' ;');
                const prevLineLength = document.lineAt(startLine + i - 1).text.length;
                edits.push(vscode.TextEdit.replace(new vscode.Range(startLine + i - 1, 0, startLine + i - 1, prevLineLength), prevLineText));
            }
        }
        else if (betweenSemiRegex.test(lineText)) {
            const match = lineText.match(betweenSemiRegex);
            if (match) {
                let content = match[2].trim();
                if (content.startsWith("J ") || content.startsWith("L ")) {
                    lineText = tpLineText + ":" + content + ' ;';
                } else {
                    lineText = tpLineText + ":  " + content + ' ;';
                }
            }
            if (inCont) {
                edits.pop();
                inCont = false;
                prevLineText = prevLineText.replace(/(\s*; ;\s*\s*$|\s*;*\s*$)/, ' ;');
                const prevLineLength = document.lineAt(startLine + i - 1).text.length;
                edits.push(vscode.TextEdit.replace(new vscode.Range(startLine + i - 1, 0, startLine + i - 1, prevLineLength), prevLineText));
            }
        }
        else if (noSemiNumRegex.test(lineText)) {
            lineText = tpLineText + ":" + lineText.slice(5).trimEnd() + '   ;';
            if (inCont) {
                edits.pop();
                inCont = false;
                prevLineText = prevLineText.replace(/(\s*; ;\s*\s*$|\s*;*\s*$)/, ' ;');
                const prevLineLength = document.lineAt(startLine + i - 1).text.length;
                edits.push(vscode.TextEdit.replace(new vscode.Range(startLine + i - 1, 0, startLine + i - 1, prevLineLength), prevLineText));
            }
        }
        else if (noSemiWordRegex.test(lineText)) {
            lineText = tpLineText + ":" + lineText.slice(5).trimEnd() + ' ;';
            if (inCont) {
                edits.pop();
                inCont = false;
                prevLineText = prevLineText.replace(/(\s*; ;\s*\s*$|\s*;*\s*$)/, ' ;');
                const prevLineLength = document.lineAt(startLine + i - 1).text.length;
                edits.push(vscode.TextEdit.replace(new vscode.Range(startLine + i - 1, 0, startLine + i - 1, prevLineLength), prevLineText));
            }
        }
        else if (onlySemiRegex.test(lineText)) {
            lineText = tpLineText + ":   ;";
            if (inCont) {
                edits.pop();
                inCont = false;
                prevLineText = prevLineText.replace(/(\s*; ;\s*\s*$|\s*;*\s*$)/, ' ;');
                const prevLineLength = document.lineAt(startLine + i - 1).text.length;
                edits.push(vscode.TextEdit.replace(new vscode.Range(startLine + i - 1, 0, startLine + i - 1, prevLineLength), prevLineText));
            }
        }
        else if (lineNumRegex.test(lineText)) {
            lineText = tpLineText + ":" + lineText.slice(5);
            if (inCont) {
                edits.pop();
                inCont = false;
                prevLineText = prevLineText.replace(/(\s*; ;\s*\s*$|\s*;*\s*$)/, ' ;');
                const prevLineLength = document.lineAt(startLine + i - 1).text.length;
                edits.push(vscode.TextEdit.replace(new vscode.Range(startLine + i - 1, 0, startLine + i - 1, prevLineLength), prevLineText));
            }
        }
        else if (moveRegex.test(lineText)) {
            lineText = tpLineText + ":" + lineText.trimStart();
            movedPosition = true;
            if (inCont) {
                edits.pop();
                inCont = false;
                prevLineText = prevLineText.replace(/(\s*; ;\s*\s*$|\s*;*\s*$)/, ' ;');
                const prevLineLength = document.lineAt(startLine + i - 1).text.length;
                edits.push(vscode.TextEdit.replace(new vscode.Range(startLine + i - 1, 0, startLine + i - 1, prevLineLength), prevLineText));
            }
        }
        else {
            lineText = tpLineText + ":  " + lineText.trimStart();
        }

        prevLineText = lineText;
        const lineLength = document.lineAt(startLine + i).text.length;
        edits.push(vscode.TextEdit.replace(new vscode.Range(startLine + i, 0, startLine + i, lineLength), lineText));
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);
    await vscode.workspace.applyEdit(workspaceEdit);
    setIsAutoUpd(false);

    // Move cursor
    if (totalLines > processedLines) {
        let column = movedPosition ? 5 : 7;
        const pos = new vscode.Position(lineNumber - 1, column);
        editor.selection = new vscode.Selection(pos, pos);
    }

    fileDict[fileName][4] = lines.length;
    setFileDict(fileDict);
}

// Constructs the fileDict entry for the document
export async function setLineNumbers(document: vscode.TextDocument) {
    const fileName = path.basename(document.fileName);

    const posEndRegex = /\/POS/;
    const endRegex = /\/END/;
    const headerEndRegex = /\/MN/;
    let headExists = false;
    let endExists = false;
    let posExists = false;

    let tpLineStart = -1;
    let tpLineEnd = -1;

    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (headerEndRegex.test(line)) {
            tpLineStart = i + 1;
            headExists = true;
        }
        if (posEndRegex.test(line)) {
            tpLineEnd = i + 1;
            posExists = true;
            break;
        }
        if (!posExists && endRegex.test(line)) {
            tpLineEnd = i + 1;
            endExists = true;
        }
    }

    const fileDict = getFileDict();
    if (!(fileName in fileDict)) {
        fileDict[fileName] = [tpLineStart, tpLineEnd, headExists && (endExists || posExists), document.lineCount, document.lineCount];
    } else {
        fileDict[fileName][0] = tpLineStart;
        fileDict[fileName][1] = tpLineEnd;
        fileDict[fileName][2] = headExists && (endExists || posExists);
        fileDict[fileName][3] = document.lineCount;
    }
    setFileDict(fileDict);
}

// Handle name replacement in a single document
export function editName(document: vscode.TextDocument, oldItem: string, oldName: string, newName: string, hidden: boolean = false) {
    const text = document.getText();
    const oldItemRegex = new RegExp(`${oldItem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    const newItemText = oldItem.replace(oldName, newName);
    const newText = text.replace(oldItemRegex, newItemText);

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
    edit.replace(document.uri, fullRange, newText);
    vscode.workspace.applyEdit(edit);

    if (hidden) {
        document.save();
    }
}

// Handle name replacement in all LS files in a directory
export async function editNameInDirectory(directory: vscode.Uri, oldItem: string, oldName: string, newName: string) {
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(directory, '*'));
    for (const file of files) {
        if (!file.fsPath.endsWith('.ls') && !file.fsPath.endsWith('.LS')) continue;

        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();
        const oldItemRegex = new RegExp(`${oldItem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        if (oldItemRegex.test(text)) {
            editName(document, oldItem, oldName, newName, true);
        }
    }
}
